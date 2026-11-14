function applySshRules(internalData) {
  const sshConfig = internalData.evidence.find((item) => item.type === "ssh_config")?.symbol || "";
  const settings = Object.fromEntries(sshConfig.split(/\r?\n/).map((line) => {
    const [key, ...rest] = line.trim().toLowerCase().split(/\s+/);
    return [key, rest.join(" ")];
  }).filter(([key, value]) => key && value));
  const findings = [];

  if (settings.permitrootlogin === "yes") {
    findings.push({
      title: "SSH Root Login Enabled",
      severity: "Medium",
      cwe: "CWE-306",
      evidence: ["PermitRootLogin yes"],
      location: "/etc/ssh/sshd_config",
      check: "SSH Rule - Hardening",
      summary: "Konfigurasi SSH mengizinkan login langsung sebagai root. Batasi akses root dan gunakan akun administrator terpisah bila memungkinkan."
    });
  }
  if (settings.passwordauthentication === "yes") {
    findings.push({
      title: "SSH Password Authentication Enabled",
      severity: "Low",
      cwe: "CWE-521",
      evidence: ["PasswordAuthentication yes"],
      location: "/etc/ssh/sshd_config",
      check: "SSH Rule - Hardening",
      summary: "Server menerima autentikasi SSH dengan password. Pertimbangkan kunci publik dan pembatasan percobaan login sesuai kebijakan operasional."
    });
  }

  return findings;
}
module.exports = { applySshRules };
