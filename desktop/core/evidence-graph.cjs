function buildEvidenceGraph(evidenceList) {
  return {
    nodes: evidenceList.map((e, idx) => ({ id: `node-${idx}`, ...e })),
    edges: evidenceList.slice(0, -1).map((_, idx) => ({ from: `node-${idx}`, to: `node-${idx+1}`, relation: "CORRELATED_INDICATOR" }))
  };
}

module.exports = { buildEvidenceGraph };
