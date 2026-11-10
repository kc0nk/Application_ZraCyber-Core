function analyzeComponents(components) {
  const findings = [];
  if (components.exportedCount > 0) {
    findings.push({
      title: "MASTG-PLATFORM-03: Exported Components Without Permission",
      severity: "High",
      check: "Components Analyzer - Exported",
      summary: `Ditemukan ${components.exportedCount} komponen (Activity/Service/Receiver) yang diekspor tanpa pembatasan permission, rentan terhadap intent injection.`
    });
  }
  return { findings };
}

module.exports = { analyzeComponents };
