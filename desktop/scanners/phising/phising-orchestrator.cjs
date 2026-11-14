const { isIP } = require("node:net");
const { calculateRisk } = require("../../core/risk-engine.cjs");
const { validatePhisingTarget } = require("./target-validator.cjs");
const { inspectPage, safeDisplayUrl } = require("./page-inspector.cjs");

const BRAND_DOMAINS = {
  amazon: "amazon.com",
  apple: "apple.com",
  bca: "bca.co.id",
  facebook: "facebook.com",
  google: "google.com",
  instagram: "instagram.com",
  linkedin: "linkedin.com",
  microsoft: "microsoft.com",
  netflix: "netflix.com",
  paypal: "paypal.com",
  tokopedia: "tokopedia.com",
  whatsapp: "whatsapp.com",
};
const REQUEST_COLLECTOR_DOMAINS = [
  "webhook.site",
  "requestbin.com",
  "requestbin.net",
  "requestcatcher.com",
  "beeceptor.com",
  "pipedream.net",
];

function domainMatchesBrand(host, canonicalDomain) {
  return host === canonicalDomain || host.endsWith(`.${canonicalDomain}`);
}

function getRequestCollectorHost(host) {
  const normalized = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  return REQUEST_COLLECTOR_DOMAINS.find((domain) => normalized === domain || normalized.endsWith(`.${domain}`)) || "";
}

function addSignal(signals, score, label, evidence) {
  signals.push({ label, evidence, score });
}

function inspectUrlIndicators(url, hadUserInfo) {
  const signals = [];
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const fullUrl = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  const labels = host.split(".").filter(Boolean);
  const collectorDomain = getRequestCollectorHost(host);

  if (hadUserInfo) addSignal(signals, 25, "URL menyertakan user-info", "URL memiliki bagian username/password sebelum host; bagian kredensial tidak diteruskan saat koneksi.");
  if (isIP(host)) addSignal(signals, 25, "Host berupa alamat IP", `Host menggunakan IP langsung: ${host}.`);
  if (host.startsWith("xn--") || host.split(".").some((label) => label.startsWith("xn--"))) {
    addSignal(signals, 20, "Host menggunakan punycode", "Nama domain berisi label IDN punycode yang perlu ditinjau untuk kemungkinan kemiripan karakter.");
  }

  const mentionedBrand = Object.entries(BRAND_DOMAINS).find(([brand, canonical]) =>
    host.includes(brand) && !domainMatchesBrand(host, canonical));
  if (mentionedBrand) {
    addSignal(signals, 30, "Nama brand muncul pada domain yang berbeda", `Nama '${mentionedBrand[0]}' muncul pada host ${host}, yang bukan ${mentionedBrand[1]}.`);
  }

  const shortenerHosts = ["bit.ly", "t.co", "tinyurl.com", "tiny.cc", "is.gd", "cutt.ly", "shorturl.at"];
  if (shortenerHosts.some((shortener) => domainMatchesBrand(host, shortener))) {
    addSignal(signals, 12, "URL memakai layanan pemendek", `Host ${host} menyamarkan alamat tujuan akhir sampai redirect diperiksa.`);
  }
  if (collectorDomain) {
    addSignal(signals, 8, "Target berada pada layanan penerima webhook", `Host ${collectorDomain} adalah layanan penerima request yang dapat dipakai untuk berbagai tujuan; domain ini sendiri bukan bukti phishing.`);
  }

  if (labels.length >= 5) addSignal(signals, 8, "Struktur subdomain panjang", `Host terdiri dari ${labels.length} label domain.`);
  if (/\b(login|signin|verify|verification|secure|account|update|wallet|password|payment|billing|confirm)\b/i.test(fullUrl)) {
    addSignal(signals, 8, "URL memuat kata terkait akun atau autentikasi", "Path atau query URL memuat istilah login, verifikasi, akun, pembayaran, atau kata sejenis.");
  }
  if (url.protocol === "http:" && /\b(login|signin|verify|account|password|payment)\b/i.test(fullUrl)) {
    addSignal(signals, 10, "Halaman autentikasi menggunakan HTTP", "URL berindikasi login atau akun tidak memakai HTTPS.");
  }
  return signals;
}

function inspectHtmlIndicators(html, finalUrl) {
  const signals = [];
  if (!html) return signals;

  const pageUrl = new URL(finalUrl);
  const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi) || [];
  const hasPasswordField = /<input\b[^>]*type\s*=\s*["']?password\b/i.test(html);
  const hasSensitiveField = /<(?:input|textarea)\b[^>]*(?:name|id)\s*=\s*["'][^"']*(?:password|passwd|otp|one.?time|token|secret|pin|cvv|card.?number)[^"']*["']/i.test(html);

  if (hasPasswordField) {
    addSignal(signals, 12, "Halaman memiliki kolom password", "Ditemukan input password; ini umum pada login sah dan dinilai bersama indikator lain.");
  }
  if (hasSensitiveField && !hasPasswordField) {
    addSignal(signals, 8, "Form meminta data autentikasi atau pembayaran", "Nama field mengindikasikan OTP, token, PIN, atau data kartu; ini bukan bukti phishing tanpa indikator lain.");
  }

  for (const form of forms) {
    const actionMatch = /\baction\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(form);
    const rawAction = (actionMatch?.[1] ?? actionMatch?.[2] ?? actionMatch?.[3] ?? pageUrl.href).trim();
    try {
      const actionUrl = new URL(rawAction, pageUrl);
      const collectorDomain = getRequestCollectorHost(actionUrl.hostname);
      const sendsPassword = /<input\b[^>]*type\s*=\s*["']?password\b/i.test(form);
      if (collectorDomain) {
        addSignal(
          signals,
          sendsPassword ? 45 : 15,
          sendsPassword ? "Form password mengarah ke layanan penerima webhook" : "Form mengarah ke layanan penerima webhook",
          `Action form mengarah ke ${collectorDomain} (${actionUrl.origin}). Layanan ini dapat dipakai secara sah, tetapi perlu ditinjau jika menerima data sensitif.`,
        );
      }
      if (!["http:", "https:"].includes(actionUrl.protocol)) {
        addSignal(signals, sendsPassword ? 20 : 6, "Form memakai action non-HTTP", `Form mengarah ke protokol ${actionUrl.protocol}; tinjau bersama indikator lain.`);
      } else if (sendsPassword && actionUrl.origin !== pageUrl.origin) {
        addSignal(signals, 35, "Form password mengirim ke origin berbeda", `Form password pada halaman mengirim ke ${actionUrl.origin}.`);
      }
    } catch {
      addSignal(signals, 10, "Action form tidak lazim", "Tujuan form tidak dapat diurai sebagai URL normal.");
    }
  }

  const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
  const eventHandlers = [...html.matchAll(/\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)].map((match) => match[2]);
  const inlineCode = [...inlineScripts, ...eventHandlers].join("\n");
  const readsCookies = /document\s*(?:\.\s*cookie|\[\s*["']cookie["']\s*\])/i.test(inlineCode);
  const readsBrowserStorage = /\b(?:localStorage|sessionStorage)\s*(?:\.|\[)/i.test(inlineCode);
  const readsInputValues = /(?:\.value\b|\[\s*["']value["']\s*\])/i.test(inlineCode)
    && /(?:password|passwd|username|user(name)?|email|otp|token|pin|card|cvv)/i.test(inlineCode);
  const readsClipboard = /navigator\s*\.\s*clipboard\s*\.\s*readText\s*\(/i.test(inlineCode);
  const hasNetworkSink = /\b(?:fetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|WebSocket\s*\(|new\s+Image\s*\(|\.src\s*=)/i.test(inlineCode);

  if (readsCookies) {
    addSignal(signals, 18, "Pola akses document.cookie ditemukan pada kode inline", "Source inline memuat akses cookie yang dapat dibaca JavaScript; scanner tidak menjalankan source tersebut.");
  }
  if (readsBrowserStorage) {
    addSignal(signals, 8, "Pola akses localStorage/sessionStorage ditemukan", "Source inline memuat akses browser storage; periksa apakah data sensitif juga diarahkan ke mekanisme jaringan.");
  }
  if (readsInputValues) {
    addSignal(signals, 10, "Pola pembacaan field autentikasi ditemukan", "Source inline mengakses .value dan menyebut field password, username, email, OTP, token, PIN, atau data kartu.");
  }
  if (readsClipboard) {
    addSignal(signals, 12, "Pola pembacaan clipboard ditemukan", "Source inline memanggil Clipboard API untuk membaca teks yang disalin; scanner tidak menjalankan source tersebut.");
  }
  if ((readsCookies || readsBrowserStorage || readsInputValues || readsClipboard) && hasNetworkSink) {
    addSignal(signals, 30, "Pola akses data browser dan pengiriman jaringan ditemukan bersama", "Source inline memuat akses cookie, storage, input sensitif, atau clipboard serta fetch, XHR, beacon, WebSocket, atau pengiriman berbasis Image; ini belum membuktikan kode berjalan.");
  }

  const scriptUrls = [...inlineCode.matchAll(/https?:\\?\/\\?\/[^\s"'`<>]+/gi)].map((match) => match[0].replace(/\\\//g, "/"));
  const collectorUrl = scriptUrls.find((value) => {
    try { return Boolean(getRequestCollectorHost(new URL(value).hostname)); } catch { return false; }
  });
  if (collectorUrl) {
    const collectorDomain = getRequestCollectorHost(new URL(collectorUrl).hostname);
    addSignal(signals, readsCookies || readsBrowserStorage ? 35 : 12, "Skrip menyebut endpoint layanan webhook", `Kode inline memuat URL ke ${collectorDomain}; keberadaan URL saja belum membuktikan data dikirim.`);
  }

  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase() || "";
  const mentionedBrand = Object.entries(BRAND_DOMAINS).find(([brand, canonical]) =>
    title.includes(brand) && !domainMatchesBrand(pageUrl.hostname.toLowerCase(), canonical));
  if (mentionedBrand) {
    addSignal(signals, 20, "Judul halaman menyebut brand pada domain berbeda", `Judul menyebut '${mentionedBrand[0]}', tetapi host halaman adalah ${pageUrl.hostname}.`);
  }

  return signals;
}

function inspectCookieHeaders(headers, pageUrl) {
  const signals = [];
  const cookieHeaders = headers?.["set-cookie"];
  const cookies = Array.isArray(cookieHeaders) ? cookieHeaders : cookieHeaders ? [cookieHeaders] : [];
  const securePage = new URL(pageUrl).protocol === "https:";

  for (const cookie of cookies) {
    const name = String(cookie).split("=", 1)[0].trim().slice(0, 60) || "cookie";
    if (!/;\s*httponly(?:;|$)/i.test(cookie)) {
      addSignal(signals, 10, "Cookie respons tidak memiliki atribut HttpOnly", `Cookie '${name}' dapat terlihat oleh JavaScript jika disimpan browser; ini kelemahan konfigurasi, bukan bukti cookie sudah dicuri.`);
    }
    if (securePage && !/;\s*secure(?:;|$)/i.test(cookie)) {
      addSignal(signals, 5, "Cookie pada HTTPS tidak memiliki atribut Secure", `Cookie '${name}' tidak dibatasi hanya ke koneksi HTTPS.`);
    }
    if (!/;\s*samesite\s*=/i.test(cookie)) {
      addSignal(signals, 4, "Cookie tidak memiliki atribut SameSite", `Cookie '${name}' tidak menetapkan kebijakan SameSite secara eksplisit.`);
    }
  }
  return signals;
}

async function runPhisingOrchestrator(body) {
  const { url, addresses, hadUserInfo, labMode } = await validatePhisingTarget(
    body?.url || body?.targetUrl,
    { allowLocalLab: body?.labMode === true },
  );
  const signals = inspectUrlIndicators(url, hadUserInfo);
  let page = null;
  let fetchError = "";

  try {
    page = await inspectPage(url, addresses);
    signals.push(...inspectHtmlIndicators(page.html, page.finalUrl));
    signals.push(...inspectCookieHeaders(page.headers, page.finalUrl));
    if (page.redirects >= 2) {
      addSignal(signals, 8, "Rantai redirect beberapa tahap", `Target melewati ${page.redirects} redirect sebelum halaman akhir.`);
    }
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Halaman tidak dapat diambil.";
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.score, 0));
  const verdict = score >= 60
    ? "Indikasi phishing tinggi"
    : score >= 30
      ? "Mencurigakan · perlu ditinjau"
      : page
        ? "Tidak ditemukan indikator phishing kuat"
        : "Belum cukup bukti · halaman tidak terjangkau";
  const severity = score >= 60 ? "High" : score >= 30 ? "Medium" : "Info";
  const safeUrl = safeDisplayUrl(url);
  const evidence = signals.length
    ? signals.map((signal) => `${signal.label} (+${signal.score}): ${signal.evidence}`)
    : ["Pemeriksaan URL dan HTML terbatas tidak menemukan indikator phishing kuat."];
  if (fetchError) evidence.push(`Konten halaman tidak dapat diperiksa: ${fetchError}`);
  if (page?.truncated) evidence.push("Analisis konten dibatasi pada 512 KB pertama halaman.");

  const finding = {
    title: verdict,
    severity,
    check: "Phishing Heuristic Analysis",
    location: safeUrl,
    evidence,
    summary: `Skor indikator heuristik ${score}/100. Skor ini membantu triase dan bukan konfirmasi bahwa situs pasti phishing atau aman.`,
    recommendation: score >= 30
      ? "Jangan masukkan password, OTP, atau data pembayaran sebelum memverifikasi domain melalui kanal resmi. Laporkan URL ke tim keamanan atau penyedia layanan terkait."
      : "Tetap verifikasi domain dan identitas pemilik melalui kanal resmi sebelum memasukkan informasi sensitif.",
    confidence: score >= 60 ? "tinggi" : score >= 30 ? "sedang" : "rendah",
  };
  const stats = calculateRisk([finding]).stats;

  return {
    success: true,
    category: "phising",
    scanType: "passive-phishing-indicator-check",
    labMode,
    target: safeUrl,
    summary: `${verdict}. Skor indikator: ${score}/100.`,
    verdict,
    score,
    confidence: finding.confidence,
    scanStatus: page ? "completed" : "url-only",
    page: page ? {
      finalUrl: page.finalUrl,
      httpStatus: page.statusCode,
      contentType: page.contentType,
      redirects: page.redirects,
      truncated: page.truncated,
    } : null,
    limitations: "Pemeriksaan memakai indikator heuristik pada URL, HTML, skrip inline, form, dan header Set-Cookie yang diambil dengan satu HTTP GET (redirect maksimal 3, ukuran maksimal 512 KB). JavaScript eksternal tidak diunduh atau dijalankan; tidak mengirim formulir/kredensial. Hasil bukan vonis definitif; false positive dan false negative mungkin terjadi.",
    stats,
    vulnerabilities: [finding],
    findings: [finding],
    evidence: signals.map(({ label, evidence: detail, score: points }) => ({ type: "phishing_indicator", label, detail, score: points })),
    logs: [
      "[PHISHING] Analisis indikator URL dan halaman dimulai.",
      page ? `[FETCH] HTTP ${page.statusCode}; redirect ${page.redirects}; konten ${page.contentType || "tidak diketahui"}.` : `[FETCH] Konten halaman tidak tersedia; analisis URL tetap dilakukan.${fetchError ? ` ${fetchError}` : ""}`,
      `[VERDICT] ${verdict} (${score}/100).`,
    ],
    createdAt: new Date().toISOString(),
  };
}

module.exports = { runPhisingOrchestrator, inspectUrlIndicators, inspectHtmlIndicators, inspectCookieHeaders, getRequestCollectorHost };
