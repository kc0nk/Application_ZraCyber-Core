const sqliPayloads = require("../payloads/sqli-payloads.cjs");
const xssPayloads = require("../payloads/xss-payloads.cjs");
const rcePayloads = require("../payloads/rce-payloads.cjs");
const lfiPayloads = require("../payloads/lfi-payloads.cjs");
const { applySsrfRules } = require("./ssrf-rules.cjs");
const { applyAuthRules } = require("./auth-rules.cjs");

function runMasterWebRules(url, htmlContent, headers = {}, status = 200) {
  const findings = [];
  const lowerHtml = (htmlContent || "").toLowerCase();
  const lowerUrl = (url || "").toLowerCase();

  if (status === 200 && (lowerUrl.includes("/admin") || lowerUrl.includes("/administrator") || lowerUrl.includes("/dashboard/settings"))) {
    findings.push({
      title: "Exposed Administrative Interface / Endpoint (HTTP 200 OK)",
      severity: "High",
      cwe: "CWE-284",
      evidence: [`HTTP ${status} OK on admin path: ${url}`],
      location: url,
      check: "Access Control - Exposed Admin",
      summary: "Endpoint administrasi publik mengembalikan HTTP 200 OK, terkonfirmasi terbuka untuk peninjauan akses.",
      poc: `curl -I "${url}"`,
      remediation: "Terapkan kontrol akses berbasis peran (RBAC) dan otorisasi ketat sebelum menampilkan halaman admin."
    });
  }

  for (const item of sqliPayloads) {
    if (lowerHtml.includes(item.indicator.toLowerCase())) {
      findings.push({
        title: "SQL / NoSQL Database Error Message Reflected",
        severity: "High",
        cwe: "CWE-89",
        evidence: [`Reflected database error indicator: ${item.indicator}`],
        location: url,
        check: "Passive Inspection - SQL Error Reflection",
        summary: "Respon server memuat pesan kesalahan database mentah, menunjukkan potensi kerentanan penanganan error database.",
        poc: `GET "${url}?q=${encodeURIComponent(item.payload)}"`,
        remediation: "Gunakan Prepared Statements / Parameterized Queries dan nonaktifkan pesan error database mentah pada produksi."
      });
      break;
    }
  }

  for (const item of xssPayloads) {
    if (htmlContent.includes(item.indicator)) {
      findings.push({
        title: "Cross-Site Scripting (XSS) Reflected",
        severity: "High",
        cwe: "CWE-79",
        evidence: [`Reflected XSS payload indicator: ${item.indicator}`],
        location: url,
        check: "Passive Inspection - Reflected XSS",
        summary: "Input skrip JavaScript direfleksikan secara mentah ke dalam halaman web tanpa sanitasi atau output encoding.",
        poc: `GET "${url}?q=${encodeURIComponent(item.payload)}"`,
        remediation: "Terapkan HTML entity encoding pada setiap output data yang dimasukkan oleh pengguna."
      });
      break;
    }
  }

  for (const item of lfiPayloads) {
    if (htmlContent.includes(item.indicator)) {
      findings.push({
        title: item.title || "Local File Inclusion (LFI)",
        severity: item.severity || "Critical",
        cwe: item.cwe || "CWE-22",
        evidence: [`Payload tested: ${item.payload}`, `Indicator matched: ${item.indicator}`],
        location: url,
        check: "File Validation - Path Traversal / LFI",
        summary: "Aplikasi merefleksikan konten file sensitif sistem saat parameter path traversal diuji.",
        poc: `GET "${url}?file=${encodeURIComponent(item.payload)}"`,
        remediation: "Gunakan daftar putih (whitelist) untuk nama file yang diizinkan dan hindari pembacaan file sistem langsung dari input parameter."
      });
      break;
    }
  }

  findings.push(...applySsrfRules(url, htmlContent));
  findings.push(...applyAuthRules(url, htmlContent, headers));

  if (status === 200 && (lowerUrl.includes(".git") || lowerUrl.includes(".env") || lowerUrl.includes("backup.sql"))) {
    findings.push({
      title: "Exposed Sensitive Configuration / Version Control File (HTTP 200 OK)",
      severity: "Critical",
      cwe: "CWE-538",
      evidence: [`HTTP 200 OK on sensitive file: ${url}`],
      location: url,
      check: "Configuration - Sensitive Files",
      summary: "File konfigurasi atau repositori sensitif (.env, .git, backup.sql) mengembalikan HTTP 200 OK dan dapat diakses terbuka.",
      poc: `curl "${url}"`,
      remediation: "Batasi akses web server agar direktori tersembunyi (.git, .env) diblokir sepenuhnya dari publik."
    });
  }

  const csp = headers["content-security-policy"];
  if (!csp) {
    findings.push({
      title: "Missing Content Security Policy (CSP)",
      severity: "Low",
      cwe: "CWE-693",
      evidence: ["Content-Security-Policy header absent"],
      location: url,
      check: "Transport - Security Headers",
      summary: "Header CSP tidak ditemukan, meningkatkan risiko serangan Cross-Site Scripting (XSS).",
      poc: `curl -I "${url}" (Periksa ketiadaan header Content-Security-Policy)`,
      remediation: "Tambahkan header Content-Security-Policy yang ketat untuk mengontrol sumber skrip yang diizinkan."
    });
  }

  return findings;
}

module.exports = { runMasterWebRules };
