function calculateConfidence(graph, correlation) {
  let score = 0;
  if (graph.entity.username) score += 2;
  if (correlation.signalsCount >= 2) score += 2;

  let level = "LOW";
  if (score >= 5) level = "HIGH";
  else if (score >= 3) level = "MEDIUM";

  return {
    confidenceLevel: level,
    score,
    reason: `Username reuse and public profile signals indicate ${level.toLowerCase()} confidence correlation.`
  };
}

module.exports = { calculateConfidence };
