function generateIdentityReport(target, profiles, graph, correlation, confidence, aiAnalysis) {
  const matches = profiles.map(p => ({
    title: `${p.platform} - ${p.evidence?.displayName || target.rawQuery}`,
    url: p.url,
    status: p.status || "UNVERIFIED"
  }));

  return {
    success: true,
    category: "osint",
    scanType: "identity-graph-recon-factual",
    summary: `Rekon identitas faktual untuk ${target.rawQuery}. Confidence: ${confidence.confidenceLevel}`,
    visualIntelligence: {
      detected_entities: [target.username ? `Username: @${target.username}` : `Target: ${target.rawQuery}`],
      google_search_matches: matches,
      geolocation: null
    },
    identityGraph: graph,
    correlation,
    confidence,
    logs: [
      `[OSINT-INIT] Target normalizer memproses: ${target.rawQuery} (Type: ${target.searchType})`,
      `[COLLECTOR] Memindai matriks platform publik (GitHub, Reddit, GitLab, HuggingFace, dll.).`,
      `[GRAPH] Membangun identity graph dari evidence terverifikasi.`,
      `[CONFIDENCE] Confidence engine menghitung skor berbasis bobot: ${confidence.score} (${confidence.confidenceLevel}).`,
      `[SUCCESS] Laporan dossier OSINT intelijen faktual berhasil disusun.`
    ],
    limitations: "Pencarian jejak digital dilakukan secara publik dan berbasis evidence terverifikasi tanpa asumsi spekulatif."
  };
}

module.exports = { generateIdentityReport };
