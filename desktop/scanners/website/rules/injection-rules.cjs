const sqliPayloads = require("../payloads/sqli-payloads.cjs");
const xssPayloads = require("../payloads/xss-payloads.cjs");
const rcePayloads = require("../payloads/rce-payloads.cjs");
const lfiPayloads = require("../payloads/lfi-payloads.cjs");

function applyInjectionRules(url, htmlContent) {
  const findings = [];

  for (const item of sqliPayloads) {
    if (htmlContent.includes(item.indicator) || htmlContent.toLowerCase().includes("syntax error")) {
      findings.push({
        title: "SQL Injection Vulnerability Detected",
        severity: "Critical",
        cwe: "CWE-89",
        evidence: [`Payload tested: ${item.payload}`, `Indicator matched: ${item.indicator}`],
        location: url,
        check: "Rule Engine - SQLi Fuzzing",
        summary: `Respon server merefleksikan indikator database error saat payload SQL Injection diuji pada parameter URL.`
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
        evidence: [`Payload tested: ${item.payload}`, `Indicator matched: ${item.indicator}`],
        location: url,
        check: "Rule Engine - Reflected XSS",
        summary: `Input skrip JavaScript direfleksikan secara mentah ke dalam halaman web tanpa sanitasi yang memadai.`
      });
      break;
    }
  }

  for (const item of lfiPayloads) {
    if (htmlContent.includes(item.indicator)) {
      findings.push({
        title: item.title,
        severity: item.severity,
        cwe: item.cwe,
        evidence: [`Payload tested: ${item.payload}`, `Indicator matched: ${item.indicator}`],
        location: url,
        check: "Rule Engine - LFI / Path Traversal",
        summary: "Aplikasi merefleksikan konten file sensitif sistem saat parameter path traversal diuji."
      });
      break;
    }
  }

  return findings;
}

module.exports = { applyInjectionRules };
