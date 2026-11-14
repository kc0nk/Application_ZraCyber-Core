function calculateConfidence(graph, correlation) {
  let score = 0;
<<<<<<< HEAD
  if (graph.entity.username) score += 2;
  if (correlation.signalsCount >= 2) score += 2;
=======
  const profiles = graph.entity.profile || [];
  const foundProfiles = profiles.filter(p => p.status === "FOUND" || p.status === "found");

  if (graph.entity.username && foundProfiles.length > 0) score += 10;
  if (graph.entity.email) score += 15;
  if (foundProfiles.length >= 2) score += 5 * foundProfiles.length;
  if (graph.entity.name) score += 2;
>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8

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
