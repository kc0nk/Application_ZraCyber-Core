function calculateConfidence(graph, correlation) {
  let score = 0;
  const entity = graph?.entity || {};
  const profiles = Array.isArray(entity.profile) ? entity.profile : [];
  const foundProfiles = profiles.filter(p => p.status === "FOUND" || p.status === "found");

  if (entity.username && foundProfiles.length > 0) score += 10;
  if (entity.email) score += 15;
  if (foundProfiles.length >= 2) score += 5 * foundProfiles.length;
  if (entity.name) score += 2;

  let level = "LOW";
  if (score >= 70) level = "VERY HIGH";
  else if (score >= 40) level = "HIGH";
  else if (score >= 20) level = "MEDIUM";

  return {
    confidenceLevel: level,
    score,
    reason: `Confidence calculated based on verified evidence signals (Score: ${score}). Name match alone carries minimal weight to prevent false positives.`
  };
}

module.exports = { calculateConfidence };
