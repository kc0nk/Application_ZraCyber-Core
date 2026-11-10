function applySecurityRules(evidenceList) {
  const findings = [];
  for (const e of evidenceList) {
    if (e.type === "ioc" || e.severity === "Critical" || e.severity === "High") {
      findings.push({
        title: e.title || "Indikator Kompromi File",
        severity: e.severity || "High",
        cwe: e.cwe || "CWE-20",
        evidence: [e.symbol || e.detail || "Suspicious content"],
        location: e.location || "Artifact Stream",
        check: e.check || "Security Rule Engine",
        summary: e.summary || "Terdeteksi indikator anomali atau payload mencurigakan pada berkas."
      });
    }
  }
  return findings;
}

module.exports = { applySecurityRules };
