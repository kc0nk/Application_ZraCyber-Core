// Tujuan file: Pencarian pasif halaman publik melalui SerpApi Bing Search.
const { lookup } = require("node:dns/promises");
const { isIP } = require("node:net");
const ipaddr = require("ipaddr.js");
const SEARCH_ENDPOINT = "https://serpapi.com/search.json";
const DORK_QUERIES = {
  all: "",
  upload: "inurl:upload",
  admin: "inurl:admin",
  pdf: "filetype:pdf",
  api: "inurl:api",
  php: "ext:php",
};

function parseSearchScope(rawInput) {
  const input = String(rawInput || "").trim().toLowerCase();
  const candidate = input
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\*\./, "");

  if (/^\.?[a-z]{2,}$/i.test(candidate)) {
    const tld = candidate.replace(/^\./, "");
    return { queryScope: `.${tld}`, label: `*.${tld}`, tld, isTldWide: true };
  }

  const domain = candidate.replace(/^\./, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    throw new Error("Masukkan domain lengkap (contoh: example.com) atau TLD saja (contoh: .com).");
  }
  const tld = domain.split(".").pop();
  return { queryScope: domain, label: domain, tld, isTldWide: false };
}

function isWithinDomain(hostname, domain) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase().replace(/\.$/, "");
  if (root.startsWith(".")) {
    return host.length > root.length && host.endsWith(root);
  }
  return host === root || host.endsWith(`.${root}`);
}

function matchesDork(url, dorkType) {
  const value = url.href.toLowerCase();
  if (dorkType === "upload") return value.includes("upload");
  if (dorkType === "admin") return value.includes("admin");
  if (dorkType === "api") return value.includes("api");
  if (dorkType === "pdf") return /\.pdf(?:$|[?#])/.test(value);
  if (dorkType === "php") return /\.php(?:$|[?#])/.test(value);
  return true;
}

async function assertPublicResultUrl(rawUrl, domain) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("URL hasil pencarian tidak valid."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error("URL hasil melewati batas protokol/port yang diizinkan.");
  }
  if (!isWithinDomain(url.hostname, domain) || isIP(url.hostname)) {
    throw new Error("Host hasil berada di luar domain yang dikonfirmasi.");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== "unicast")) {
    throw new Error("Host hasil tidak mengarah ke alamat IP publik.");
  }
  return url;
}

async function inspectResult(url, domain) {
  try {
    const target = await assertPublicResultUrl(url, domain);
    const response = await fetch(target, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "ZraCore-Public-Header-Check/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    const headers = response.headers;
    const poweredBy = headers.get("x-powered-by") || "";
    const phpVersion = /php\s*\/?\s*([0-9][\w.-]*)/i.exec(poweredBy)?.[1] || "Tidak diumumkan";
    const missingSecurityHeaders = [
      ["content-security-policy", "Content-Security-Policy"],
      ["x-content-type-options", "X-Content-Type-Options"],
      ["referrer-policy", "Referrer-Policy"],
      ...(target.protocol === "https:" ? [["strict-transport-security", "Strict-Transport-Security"]] : []),
    ].filter(([name]) => !headers.has(name)).map(([, label]) => label);

    return {
      httpStatus: response.status,
      phpVersion,
      serverHeader: headers.get("server") || "Tidak diumumkan",
      securityHeaderObservations: missingSecurityHeaders,
      assessmentStatus: response.status >= 200 && response.status < 400 ? "checked" : "needs-review",
      activeCheckError: null,
    };
  } catch (error) {
    return {
      httpStatus: null,
      phpVersion: "Tidak diketahui",
      serverHeader: "Tidak diketahui",
      securityHeaderObservations: [],
      assessmentStatus: "unreachable",
      activeCheckError: error instanceof Error ? error.message : "Pemeriksaan HTTP gagal.",
    };
  }
}

async function runDorkingOrchestrator(body, serpApiKey, logCallback) {
  if (!serpApiKey) {
    throw new Error("SerpApi key belum disetel. Masukkan API key di panel Desktop > Bing Search.");
  }

  const scope = parseSearchScope(body?.targetDomain);
  const dorkType = Object.hasOwn(DORK_QUERIES, body?.dorkType) ? body.dorkType : "all";
  const query = [`site:${scope.queryScope}`, DORK_QUERIES[dorkType]].filter(Boolean).join(" ");
  if (typeof logCallback === "function") {
    logCallback(`[SEARCH] Bing melalui SerpApi: ${query}`);
    logCallback(`[SCOPE] ${scope.label} · pencarian pasif halaman terindeks`);
  }

  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set("engine", "bing");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("api_key", serpApiKey);
  searchUrl.searchParams.set("cc", "id");
  searchUrl.searchParams.set("safeSearch", "Strict");
  searchUrl.searchParams.set("first", "1");

  const response = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(30_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error || `HTTP ${response.status}`;
    throw new Error(`Pencarian SerpApi gagal: ${detail}`);
  }
  if (payload?.error) throw new Error(`Pencarian SerpApi gagal: ${payload.error}`);

  const results = Array.isArray(payload.organic_results) ? payload.organic_results : [];
  let urls = results
    .filter((result) => typeof result?.link === "string" && /^https?:\/\//i.test(result.link))
    .map((result) => {
      let parsedUrl;
      try { parsedUrl = new URL(result.link); } catch { return null; }
      if (!isWithinDomain(parsedUrl.hostname, scope.queryScope) || !matchesDork(parsedUrl, dorkType)) return null;
      return {
        url: result.link,
        title: typeof result.title === "string" ? result.title : "",
        source: "Bing · SerpApi",
        category: dorkType,
        httpStatus: null,
        phpVersion: "Tidak diperiksa",
        uploadEndpoint: dorkType === "upload",
        assessmentStatus: "unconfirmed",
        summary: typeof result.snippet === "string" ? result.snippet : "Halaman ditemukan di indeks pencarian publik; belum diverifikasi langsung.",
      };
    })
    .filter(Boolean);

  const activeCheckRequested = body?.confirmActiveScope === true;
  if (activeCheckRequested && scope.isTldWide) {
    throw new Error("Pengecekan HTTP aktif tidak tersedia untuk cakupan seluruh TLD. Masukkan satu domain yang kamu kelola.");
  }
  if (activeCheckRequested) {
    urls = await Promise.all(urls.slice(0, 10).map(async (item) => ({
      ...item,
      ...await inspectResult(item.url, scope.queryScope),
      summary: item.summary,
    })));
  }

  const uniqueDomains = new Set(urls.map((item) => {
    try { return new URL(item.url).hostname; } catch { return ""; }
  }).filter(Boolean));

  const logs = [
    `[SEARCH] Query: ${query}`,
    `[COLLECT] ${urls.length} hasil publik diterima dari Bing melalui SerpApi`,
    activeCheckRequested
      ? `[HTTP-CHECK] HEAD dikirim hanya ke hasil dalam domain ${scope.label}; tanpa payload eksploit`
      : `[SCOPE] ${scope.label} · hanya halaman terindeks; tidak ada koneksi ke situs hasil`,
  ];
  if (typeof logCallback === "function") logs.forEach(logCallback);

  return {
    success: true,
    scanId: `DORK-${Date.now()}`,
    rootDomain: scope.isTldWide ? null : scope.label,
    tld: `.${scope.tld}`,
    scopeLabel: scope.label,
    isTldWide: scope.isTldWide,
    scopeConfirmed: activeCheckRequested,
    activeCheckRequested,
    modeLabel: activeCheckRequested ? "Pencarian + Pemeriksaan Header" : "Pencarian Pasif · Bing via SerpApi",
    searchProvider: "Bing · SerpApi",
    searchQuery: query,
    totalFound: urls.length,
    urls,
    successfulUrls: [],
    failedUrls: [],
    createdAt: new Date().toISOString(),
    summary: {
      totalUrls: urls.length,
      uniqueDomains: uniqueDomains.size,
      uploadCandidates: dorkType === "upload" ? urls.length : 0,
      phpFindings: 0,
      vulnerabilities: 0,
      checkedHosts: activeCheckRequested ? urls.filter((item) => item.httpStatus !== null).length : 0,
      successCount: 0,
      failedCount: 0,
      markerTested: "Tidak ada · pencarian pasif",
    },
    logs,
  };
}

module.exports = { runDorkingOrchestrator, parseSearchScope };
