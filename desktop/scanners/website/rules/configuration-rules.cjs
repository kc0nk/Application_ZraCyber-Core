function applyConfigurationRules(url, headers) {
  const findings = [];
  const csp = headers["content-security-policy"];
  const hsts = headers["strict-transport-security"];

  if (!csp) {
    findings.push({
      title: "Missing Content Security Policy (CSP) Header",
      severity: "Low",
      cwe: "CWE-693",
      evidence: ["Content-Security-Policy header is absent"],
      location: url,
      check: "Config Analyzer - Headers",
      summary: "Header CSP tidak ditemukan, meningkatkan risiko serangan Cross-Site Scripting (XSS) dan data injection."
    });
  }
  if (!hsts) {
    findings.push({
      title: "Missing HTTP Strict Transport Security (HSTS)",
      severity: "Medium",
      cwe: "CWE-319",
      evidence: ["Strict-Transport-Security header is absent"],
      location: url,
      check: "Config Analyzer - TLS",
      summary: "Header HSTS tidak dikonfigurasi, rentan terhadap serangan downgrade SSL/TLS (SSL stripping)."
    });
  }
  return findings;
}

module.exports = { applyConfigurationRules };
