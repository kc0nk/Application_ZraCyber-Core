function correlateIdentity(graph) {
  const count = graph.entity.profile.length;
  return {
    correlationStatus: count >= 2 ? "POSSIBLE" : "WEAK",
    signalsCount: count,
    summary: `Ditemukan ${count} profil publik yang terhubung dengan entitas target.`
  };
}

module.exports = { correlateIdentity };
