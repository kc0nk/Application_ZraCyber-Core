function applySsrfRules(url, htmlContent) {
  const findings = [];
  if (htmlContent.includes("ami-id") || htmlContent.includes("instance-id") || htmlContent.includes("169.254.169.254")) {
    findings.push({
      title: "Server-Side Request Forgery (SSRF) Cloud Metadata Leak",
      severity: "Critical",
      cwe: "CWE-918",
      evidence: ["Cloud metadata reflection in HTTP response"],
      location: url,
      check: "SSRF - Cloud Metadata",
      summary: "Server merespons dengan data metadata cloud (AWS/GCP), mengonfirmasi kerentanan Server-Side Request Forgery (SSRF)."
    });
  }
  return findings;
}

module.exports = { applySsrfRules };
