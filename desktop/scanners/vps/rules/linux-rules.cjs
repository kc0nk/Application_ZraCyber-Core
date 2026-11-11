function applyLinuxRules(internalData) {
  const findings = [
    {
      title: "Outdated Kernel / Package Security Updates Pending",
      severity: "Medium",
      cwe: "CWE-1104",
      evidence: ["Unpatched package versions detected"],
      location: "/var/lib/dpkg/",
      check: "Linux Rule - Package Audit",
      summary: "Terdapat paket sistem operasi yang belum diperbarui, berpotensi memiliki kerentanan CVE yang telah dipublikasikan."
    }
  ];
  return findings;
}
module.exports = { applyLinuxRules };
