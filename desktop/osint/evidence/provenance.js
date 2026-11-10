function trackProvenance(source, rawData, verified = true) {
  return {
    source,
    verified,
    retrievedAt: new Date().toISOString(),
    dataHash: Buffer.from(JSON.stringify(rawData)).toString("base64").slice(0, 16)
  };
}

module.exports = { trackProvenance };
