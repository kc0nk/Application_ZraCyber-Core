function createEvidence(type, symbol, location, confidence = 0.85, metadata = {}) {
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    symbol,
    location,
    confidence,
    timestamp: new Date().toISOString(),
    metadata
  };
}

module.exports = { createEvidence };
