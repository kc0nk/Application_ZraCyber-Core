function calculateRisk(findings) {
  const crit = findings.filter(f => (f.severity || "").toLowerCase() === "critical").length;
  const high = findings.filter(f => (f.severity || "").toLowerCase() === "high").length;
  const med = findings.filter(f => (f.severity || "").toLowerCase() === "medium").length;
  const low = findings.filter(f => (f.severity || "").toLowerCase() === "low").length;
  const info = findings.filter(f => (f.severity || "").toLowerCase() === "informational" || (f.severity || "").toLowerCase() === "info").length;

  let riskScore = (crit * 25) + (high * 15) + (med * 8) + (low * 3);
  let riskLevel = "LOW";
  if (riskScore >= 40 || crit > 0) riskLevel = "CRITICAL";
  else if (riskScore >= 25) riskLevel = "HIGH";
  else if (riskScore >= 10) riskLevel = "MEDIUM";

  return { riskScore, riskLevel, stats: { critical: crit, high, medium: med, low, info, total: findings.length } };
}

module.exports = { calculateRisk };
