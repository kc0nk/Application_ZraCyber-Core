const sqliPayloads = require("../payloads/sqli-payloads.cjs");
const xssPayloads = require("../payloads/xss-payloads.cjs");
const rcePayloads = require("../payloads/rce-payloads.cjs");
const lfiPayloads = require("../payloads/lfi-payloads.cjs");

function runMasterWebRules(url, htmlContent, headers = {}, status = 200) {
  const findings = [];
  const lowerHtml = (htmlContent || "").toLowerCase();
  const lowerUrl = (url || "").toLowerCase();

  // 1. ACCESS CONTROL (Exposed Admin - ONLY if HTTP 200 OK)
  if (status === 200 && (lowerUrl.includes("/admin") || lowerUrl.includes("/administrator") || lowerUrl.includes("/dashboard/settings"))) {
    findings.push({
      title: "Exposed Administrative Interface / Endpoint (HTTP 200 OK)",
      severity: "High",
      cwe: "CWE-284",
      evidence: [`HTTP ${status} OK on admin path: ${url}`],
      location: url,
      check: "Access Control - Exposed Admin",
      summary: "Endpoint administrasi publik mengembalikan HTTP 200 OK, terkonfirmasi terbuka untuk peninjauan akses."
    });
  }

  // 2. INJECTIONS - Passive Indicator Match
  for (const item of sqliPayloads) {
    if (lowerHtml.includes(item.indicator.toLowerCase())) {
      findings.push({
        title: "SQL / NoSQL Database Error Message Reflected",
        severity: "High",
        cwe: "CWE-89",
        evidence: [`Reflected database error indicator: ${item.indicator}`],
        location: url,
        check: "Passive Inspection - SQL Error Reflection",
        summary: "Respon server memuat pesan kesalahan database mentah, menunjukkan potensi kerentanan penanganan error database."
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
        summary: "Input skrip JavaScript direfleksikan secara mentah ke dalam halaman web tanpa sanitasi atau output encoding."
      });
      break;
    }
  }

  // 3. SENSITIVE FILES - ONLY if HTTP 200 OK
  if (status === 200 && (lowerUrl.includes(".git") || lowerUrl.includes(".env") || lowerUrl.includes("backup.sql"))) {
    findings.push({
      title: "Exposed Sensitive Configuration / Version Control File (HTTP 200 OK)",
      severity: "Critical",
      cwe: "CWE-538",
      evidence: [`HTTP 200 OK on sensitive file: ${url}`],
      location: url,
      check: "Configuration - Sensitive Files",
      summary: "File konfigurasi atau repositori sensitif (.env, .git, backup.sql) mengembalikan HTTP 200 OK dan dapat diakses terbuka."
    });
  }

  // 4. SECURITY HEADERS
  const csp = headers["content-security-policy"];
  if (!csp) {
    findings.push({
      title: "Missing Content Security Policy (CSP)",
      severity: "Low",
      cwe: "CWE-693",
      evidence: ["Content-Security-Policy header absent"],
      location: url,
      check: "Transport - Security Headers",
      summary: "Header CSP tidak ditemukan, meningkatkan risiko serangan Cross-Site Scripting (XSS)."
    });
  }

  return findings;
}

module.exports = { runMasterWebRules };
