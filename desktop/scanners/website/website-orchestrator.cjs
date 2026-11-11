const { validateWebsiteTarget } = require("./target-validator.cjs");
const { checkScope } = require("./scope-manager.cjs");
const { analyzeDnsRecon } = require("./recon/dns-analyzer.cjs");
const { crawlWebsite } = require("./crawler/crawler-engine.cjs");
const { runMasterWebRules } = require("./rules/master-web-rules.cjs");
const { runActiveFuzzer } = require("./fuzzing/active-fuzzer.cjs");
const { correlateFindingsWithAi } = require("../../ai/finding-correlator.cjs");
const { generateWriteupReport } = require("../../ai/writeup-generator.cjs");
const { calculateRisk } = require("../../core/risk-engine.cjs");

async function runWebsiteOrchestrator(body, apiKey) {
  const target = validateWebsiteTarget(body.targetUrl, body.scopeConfirmed);
  checkScope(target.url, target.origin);

  const isLoginMode = body.accessMode === "login" && Boolean(body.loginUser) && Boolean(body.loginPass);
  let sessionCookie = "";
  let authStatus = { mode: "anonymous", status: "unauthenticated" };

  if (isLoginMode) {
    try {
      const loginRes = await globalThis.fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ZraCore-WebScanner/3.0" },
        body: new URLSearchParams({ username: body.loginUser, password: body.loginPass }).toString(),
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (loginRes) {
        const setCookie = loginRes.headers.get("set-cookie");
        if (setCookie) {
          sessionCookie = setCookie.split(";")[0];
          authStatus = { mode: "login", status: "authenticated", user: body.loginUser };
        }
      }
    } catch {}
  }

  const dns = await analyzeDnsRecon(target.hostname);
  const crawlResult = await crawlWebsite(target.url, target.origin, 30, sessionCookie);
  const urlGraph = { nodes: crawlResult.nodes, edges: crawlResult.edges };

  const reachablePages = crawlResult.pages.filter(p => p.reachable);
  if (reachablePages.length === 0) {
    throw new Error(`Target web ${target.url} tidak dapat dijangkau atau menolak koneksi. Pastikan URL dan server target aktif.`);
  }

  let ruleFindings = [];
  for (const page of reachablePages) {
    const findings = runMasterWebRules(page.url, page.body, page.headers, page.status);
    ruleFindings.push(...findings);
  }

  const activeInjectionFindings = await runActiveFuzzer(reachablePages, target.origin);
  ruleFindings.push(...activeInjectionFindings);

  if (ruleFindings.length === 0) {
    ruleFindings.push({
      title: "Secure Headers & Active Fuzzing Baseline Audit",
      severity: "Info",
      cwe: "CWE-693",
      evidence: [`${reachablePages.length} halaman berhasil di-crawl dan diuji aktif`],
      location: target.origin,
      check: "Security Rule Engine - Active Fuzzing Baseline",
      summary: `Target web ${target.origin} berhasil diuji (${reachablePages.length} halaman dijangkau). Pengujian parameter aktif dan audit pasif tidak menemukan indikasi celah kritis.`
    });
  }

  const correlatedFindings = await correlateFindingsWithAi(urlGraph, ruleFindings, apiKey);
  const riskResult = calculateRisk(correlatedFindings);
  const report = generateWriteupReport(target, dns, urlGraph, correlatedFindings, riskResult.stats);

  report.authentication = authStatus;

  return report;
}

module.exports = { runWebsiteOrchestrator };
