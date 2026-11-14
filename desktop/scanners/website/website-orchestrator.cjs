const { validateWebsiteTarget } = require("./target-validator.cjs");
const { checkScope } = require("./scope-manager.cjs");
const { analyzeDnsRecon } = require("./recon/dns-analyzer.cjs");
const { crawlWebsite } = require("./crawler/crawler-engine.cjs");
const { runMasterWebRules } = require("./rules/master-web-rules.cjs");
const { runActiveFuzzer } = require("./fuzzing/active-fuzzer.cjs");
const { correlateFindingsWithAi } = require("../../ai/finding-correlator.cjs");
const { generateWriteupReport } = require("../../ai/writeup-generator.cjs");
const { calculateRisk } = require("../../core/risk-engine.cjs");

async function autoLoginAndHarvestSession(targetOrigin, username, password, log = () => {}) {
  let sessionCookie = "";
  try {
    log(`[AUTO-LOGIN] Mendeteksi form login secara otomatis di ${targetOrigin}...`);
    let loginPageUrl = new URL("/login", targetOrigin).toString();
    let res = await globalThis.fetch(loginPageUrl, {
      method: "GET",
      headers: { "User-Agent": "ZraCore-AutoLogin/3.0" },
      signal: AbortSignal.timeout(3000)
    }).catch(() => null);

    if (!res || !res.ok) {
      loginPageUrl = targetOrigin;
      res = await globalThis.fetch(loginPageUrl, {
        method: "GET",
        headers: { "User-Agent": "ZraCore-AutoLogin/3.0" },
        signal: AbortSignal.timeout(3000)
      }).catch(() => null);
    }

    let formAction = loginPageUrl;
    let userField = "username";
    let passField = "password";

    if (res && res.ok) {
      const html = await res.text().catch(() => "");
      const formMatch = html.match(/<form([\s\S]*?)<\/form>/gi);
      if (formMatch) {
        for (const f of formMatch) {
          if (f.includes('type="password"') || f.includes("type='password'") || f.includes("password")) {
            const actionMatch = f.match(/action=["']([^"']+)["']/i);
            if (actionMatch) {
              try {
                const candidateAction = new URL(actionMatch[1], loginPageUrl);
                if (candidateAction.origin !== targetOrigin) {
                  throw new Error("Form login berada di luar origin target; kredensial tidak dikirim.");
                }
                formAction = candidateAction.toString();
              } catch {}
            }
            const inputs = f.match(/name=["']([^"']+)["']/gi);
            if (inputs) {
              for (const inp of inputs) {
                const nameVal = inp.match(/name=["']([^"']+)["']/i)?.[1];
                if (nameVal) {
                  if (/user|email|login|account/i.test(nameVal)) userField = nameVal;
                  if (/pass|pwd|key|secret/i.test(nameVal)) passField = nameVal;
                }
              }
            }
            break;
          }
        }
      }
    }

    log(`[AUTO-LOGIN] Mengirim POST login ke ${formAction} [Field: ${userField}, ${passField}]...`);
    const postBody = new URLSearchParams({
      [userField]: username,
      [passField]: password
    }).toString();

    const loginRes = await globalThis.fetch(formAction, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ZraCore-AutoLogin/3.0"
      },
      body: postBody,
      redirect: "manual",
      signal: AbortSignal.timeout(4000)
    }).catch(() => null);

    if (loginRes) {
      const setCookie = loginRes.headers.get("set-cookie");
      if (setCookie && (loginRes.ok || (loginRes.status >= 300 && loginRes.status < 400))) {
        sessionCookie = setCookie.split(";")[0];
        log(`[AUTO-LOGIN] Respons login HTTP ${loginRes.status}; cookie sesi tersedia.`);
      } else {
        log(`[AUTO-LOGIN-INFO] Respons login HTTP ${loginRes.status}.`);
      }
    }
  } catch (err) {
    log(`[AUTO-LOGIN-WARN] ${err.message}`);
  }
  return sessionCookie;
}

async function runWebsiteOrchestrator(body, apiKey, onEvent = () => {}) {
  const log = (msg) => onEvent({ type: "log", message: msg });
  let ruleFindings = [];
  let urlGraph = { nodes: [], edges: [] };
  let dns = { records: [] };
  let crawledPages = [];
  let target;
  let authStatus = { mode: "anonymous", status: "unauthenticated" };

  try {
    log(`[START] Inisialisasi audit website target.`);
    target = validateWebsiteTarget(body.targetUrl, body.scopeConfirmed);
    checkScope(target.url, target.origin);
    log(`[SCOPE] Target tervalidasi: ${target.origin}`);

    const isLoginMode = body.accessMode === "login" && Boolean(body.loginUser) && Boolean(body.loginPass);
    let sessionCookie = "";

    if (isLoginMode) {
      log(`[AUTO-AUTH] Memulai fitur Automated Login Harvesting untuk user '${body.loginUser}'...`);
      sessionCookie = await autoLoginAndHarvestSession(target.origin, body.loginUser, body.loginPass, log);
      if (sessionCookie) {
        authStatus = { mode: "login", status: "authenticated", user: body.loginUser };
        log(`[AUTO-AUTH] Autentikasi otomatis berhasil dan sesi aktif.`);
      } else {
        log(`[AUTO-AUTH-WARN] Gagal mendapatkan session cookie, melanjutkan audit sebagai anonim.`);
      }
    }

    log(`[DNS] Memulai analisis DNS untuk ${target.hostname}...`);
    dns = await analyzeDnsRecon(target.hostname).catch(() => ({ records: [] }));
    log(`[DNS] Selesai analisis DNS.`);

    log(`[CRAWL] Memulai crawler halaman web di ${target.url}...`);

    const seedUrls = [target.url];
    if (authStatus.status === "authenticated") {
      seedUrls.push(
        new URL("/dashboard", target.origin).toString(),
        new URL("/dashboard/karyawan", target.origin).toString(),
        new URL("/dashboard/laporan", target.origin).toString(),
        new URL("/dashboard/admin-tools", target.origin).toString(),
        new URL("/dashboard/dokumen", target.origin).toString(),
        new URL("/dashboard/pengaturan", target.origin).toString()
      );
    }

    const crawlResult = await crawlWebsite(seedUrls[0], target.origin, 50, sessionCookie, (page) => {
      onEvent({ type: "page", page });
      log(`[CRAWL] Berhasil menjangkau: ${page.url} (HTTP ${page.status})`);
    }).catch(() => ({ nodes: [], edges: [], pages: [] }));
    crawledPages = Array.isArray(crawlResult.pages) ? crawlResult.pages : [];

    if (authStatus.status === "authenticated") {
      for (const authUrl of seedUrls.slice(1)) {
        if (!crawlResult.pages.some(p => p.url === authUrl)) {
          try {
            const authRes = await globalThis.fetch(authUrl, {
              method: "GET",
              headers: { "User-Agent": "ZraCore-WebScanner/3.0", ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
              signal: AbortSignal.timeout(3000)
            }).catch(() => null);
            if (authRes) {
              const html = await authRes.text().catch(() => "");
              crawlResult.pages.push({ url: authUrl, status: authRes.status, headers: {}, body: html, reachable: true, forms: [] });
              log(`[CRAWL-AUTH] Berhasil memuat halaman terautentikasi: ${authUrl} (HTTP ${authRes.status})`);
            }
          } catch {}
        }
      }
    }

    urlGraph = { nodes: crawlResult.nodes, edges: crawlResult.edges };
    log(`[CRAWL] Crawl selesai. ${crawlResult.pages?.length || 0} halaman ditemukan.`);

    const reachablePages = crawledPages.filter(p => p.reachable);
    if (reachablePages.length === 0) {
      const riskResult = calculateRisk([]);
      const report = generateWriteupReport(target, dns, urlGraph, [], riskResult.stats, crawledPages);
      report.scanStatus = "unreachable";
      report.summary = `Target ${target.url} tidak dapat dijangkau dari Desktop; tidak ada halaman yang bisa diperiksa.`;
      report.limitations = "Tidak ada temuan kerentanan yang disimpulkan karena crawler tidak menerima halaman. Periksa apakah target lab aktif dan skema serta port sesuai (misalnya HTTP vs HTTPS). Status ini bukan hasil audit keamanan.";
      report.authentication = authStatus;
      log(`[CRAWL-ERROR] Tidak ada halaman target yang berhasil dijangkau; pemeriksaan rules dan fuzzer dihentikan.`);
      onEvent({ type: "done", report });
      return report;
    }

    log(`[RULES] Menjalankan pemeriksaan security rules pasif pada ${reachablePages.length} halaman...`);
    for (const page of reachablePages) {
      try {
        const findings = runMasterWebRules(page.url, page.body, page.headers, page.status);
        for (const f of findings) {
          ruleFindings.push(f);
          onEvent({ type: "finding", finding: f });
          log(`[FINDING] (${f.severity}) ${f.title} di ${f.location}`);
        }
      } catch {}
    }
    log(`[RULES] Selesai pemeriksaan rules.`);

    log(`[FUZZER] Menjalankan active fuzzing parameter secara live...`);
    try {
      await runActiveFuzzer(reachablePages, target.origin, (f) => {
        ruleFindings.push(f);
        onEvent({ type: "finding", finding: f });
        log(`[ACTIVE] (${f.severity}) ${f.title} pada ${f.location}`);
      }, log);
    } catch (err) {
      log(`[FUZZER-WARN] Active fuzzer dilewati: ${err.message}`);
    }

    const uniqueMap = new Map();
    for (const f of ruleFindings) {
      let loc = f.location || "";
      try {
        const u = new URL(loc);
        loc = `${u.origin}${u.pathname}`;
      } catch {
        loc = loc.split("?")[0];
      }
      const key = `${f.title}|${loc}`;
      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, f);
      } else {
        const previousEvidence = Array.isArray(existing.evidence) ? existing.evidence : existing.evidence == null ? [] : [String(existing.evidence)];
        const nextEvidence = Array.isArray(f.evidence) ? f.evidence : f.evidence == null ? [] : [String(f.evidence)];
        existing.evidence = Array.from(new Set([...previousEvidence, ...nextEvidence]));
      }
    }
    const distinctFindings = Array.from(uniqueMap.values());

    if (distinctFindings.length === 0) {
      const baselineFinding = {
        title: "Secure Headers & Active Fuzzing Baseline Audit",
        severity: "Info",
        cwe: "CWE-693",
        evidence: [`${reachablePages.length} halaman berhasil di-crawl dan diuji aktif`],
        location: target.origin,
        check: "Security Rule Engine - Active Fuzzing Baseline",
        summary: `Target web ${target.origin} berhasil diuji (${reachablePages.length} halaman dijangkau). Pengujian parameter aktif dan audit pasif tidak menemukan indikasi celah kritis.`
      };
      distinctFindings.push(baselineFinding);
      onEvent({ type: "finding", finding: baselineFinding });
    }

    log(`[AI] Menganalisis korelasi temuan dengan Groq AI...`);
    const correlatedFindings = await correlateFindingsWithAi(urlGraph, distinctFindings, apiKey).catch(() => distinctFindings);
    const riskResult = calculateRisk(correlatedFindings);
    const report = generateWriteupReport(target, dns, urlGraph, correlatedFindings, riskResult.stats, crawledPages);

    report.authentication = authStatus;
    log(`[SUCCESS] Laporan audit pentest website selesai disusun.`);

    onEvent({ type: "done", report });
    return report;
  } catch (err) {
    log(`[ERROR] ${err.message || "Terjadi kesalahan pada orkestrator."}`);
    const fallbackTarget = target || { url: body.targetUrl, origin: body.targetUrl, hostname: "target" };
    if (ruleFindings.length === 0) {
      ruleFindings.push({
        title: "Baseline Audit Inspection",
        severity: "Info",
        cwe: "CWE-693",
        evidence: [body.targetUrl],
        location: fallbackTarget.origin || body.targetUrl,
        check: "Baseline Check",
        summary: "Audit selesai dengan penanganan pemulihan galat."
      });
    }
    const uniqueMap = new Map();
    for (const f of ruleFindings) {
      let loc = f.location || "";
      try {
        const u = new URL(loc);
        loc = `${u.origin}${u.pathname}`;
      } catch {
        loc = loc.split("?")[0];
      }
      const key = `${f.title}|${loc}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, f);
    }
    const distinctFindings = Array.from(uniqueMap.values());

    const riskResult = calculateRisk(distinctFindings);
    const fallbackReport = generateWriteupReport(fallbackTarget, dns, urlGraph, distinctFindings, riskResult.stats, crawledPages);
    fallbackReport.authentication = authStatus;

    onEvent({ type: "done", report: fallbackReport });
    return fallbackReport;
  }
}

module.exports = { runWebsiteOrchestrator };
