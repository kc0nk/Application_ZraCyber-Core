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

function domainMatchesBrand(host, canonicalDomain) {
  return host === canonicalDomain || host.endsWith(`.${canonicalDomain}`);
}

function addSignal(signals, score, label, evidence) {
  signals.push({ label, evidence, score });
}

function inspectUrlIndicators(url, hadUserInfo) {
  const signals = [];
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const fullUrl = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  const labels = host.split(".").filter(Boolean);

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
  const passwordForms = forms.filter((form) => /<input\b[^>]*type\s*=\s*["']?password\b/i.test(form));
  const hasPasswordField = /<input\b[^>]*type\s*=\s*["']?password\b/i.test(html);

  if (hasPasswordField) {
    addSignal(signals, 12, "Halaman memiliki kolom password", "Ditemukan input password; ini umum pada login sah dan dinilai bersama indikator lain.");
  }

  for (const form of passwordForms) {
    const actionMatch = /\baction\s*=\s*(["'])(.*?)\1/i.exec(form);
    const rawAction = actionMatch?.[2]?.trim() || pageUrl.href;
    try {
      const actionUrl = new URL(rawAction, pageUrl);
      if (!["http:", "https:"].includes(actionUrl.protocol)) {
        addSignal(signals, 25, "Form password memakai action non-HTTP", `Form password mengarah ke protokol ${actionUrl.protocol}.`);
      } else if (actionUrl.origin !== pageUrl.origin) {
        addSignal(signals, 35, "Form password mengirim ke origin berbeda", `Form password pada halaman mengirim ke ${actionUrl.origin}.`);
      }
    } catch {
      addSignal(signals, 10, "Action form password tidak lazim", "Tujuan form password tidak dapat diurai sebagai URL normal.");
    }
  }

  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase() || "";
  const mentionedBrand = Object.entries(BRAND_DOMAINS).find(([brand, canonical]) =>
    title.includes(brand) && !domainMatchesBrand(pageUrl.hostname.toLowerCase(), canonical));
  if (mentionedBrand) {
    addSignal(signals, 20, "Judul halaman menyebut brand pada domain berbeda", `Judul menyebut '${mentionedBrand[0]}', tetapi host halaman adalah ${pageUrl.hostname}.`);
  }

  return signals;
}

async function runPhisingOrchestrator(body) {
  const { url, addresses, hadUserInfo } = await validatePhisingTarget(body?.url || body?.targetUrl);
  const signals = inspectUrlIndicators(url, hadUserInfo);
  let page = null;
  let fetchError = "";

  try {
    page = await inspectPage(url, addresses);
    signals.push(...inspectHtmlIndicators(page.html, page.finalUrl));
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
    limitations: "Pemeriksaan memakai indikator heuristik pada URL dan HTML yang diambil dengan satu HTTP GET (redirect maksimal 3, ukuran maksimal 512 KB). Tidak mengirim formulir/kredensial dan tidak menjalankan JavaScript. Hasil bukan vonis definitif; false positive dan false negative mungkin terjadi.",
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

module.exports = { runPhisingOrchestrator, inspectUrlIndicators, inspectHtmlIndicators };
