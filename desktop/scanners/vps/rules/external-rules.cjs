function applyExternalRules(externalData) {
  const findings = [];
  if (externalData.openPorts && externalData.openPorts.includes(22)) {
    findings.push({
      title: "SSH Port 22 Exposed to Public Internet",
      severity: "Medium",
      cwe: "CWE-284",
      evidence: ["Port 22 is open on external IP"],
      location: externalData.ip,
      check: "External Rule - Port Exposure",
      summary: "Port SSH terbuka ke publik, disarankan menggunakan port non-standard atau pembatasan firewall (fail2ban)."
    });
  }
  return findings;
}
module.exports = { applyExternalRules };
