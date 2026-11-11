function applySshRules(internalData) {
  const findings = [
    {
      title: "SSH Root Password Authentication Enabled",
      severity: "High",
      cwe: "CWE-521",
      evidence: ["PermitRootLogin yes / PasswordAuthentication yes"],
      location: "/etc/ssh/sshd_config",
      check: "SSH Rule - Hardening",
      summary: "Konfigurasi SSH mengizinkan login root langsung via password. Sebaiknya gunakan SSH Key Authentication dan nonaktifkan PermitRootLogin."
    }
  ];
  return findings;
}
module.exports = { applySshRules };
