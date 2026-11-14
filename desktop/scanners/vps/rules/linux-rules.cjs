function applyLinuxRules(internalData) {
  const findings = [];

  const updatesOutput = internalData.evidence.find((item) => item.type === "package_audit")?.symbol || "";
  const pendingUpdates = Number(updatesOutput.trim());
  if (Number.isFinite(pendingUpdates) && pendingUpdates > 0) {
    findings.push({
      title: "System Package Updates Available",
      severity: "Low",
      cwe: "CWE-1104",
      evidence: [`${pendingUpdates} package update(s) reported by package manager`],
      location: "Package manager",
      check: "Linux Rule - Package Audit",
      summary: `Package manager melaporkan ${pendingUpdates} pembaruan tersedia. Tinjau paket dan changelog sebelum memasang pembaruan.`
    });
  }

  return findings;
}
module.exports = { applyLinuxRules };
