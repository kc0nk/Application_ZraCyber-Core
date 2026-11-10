function generateIdentityReport(target, profiles, graph, correlation, confidence, aiAnalysis) {
  const matches = profiles.map(p => ({ title: `${p.platform} - ${p.displayName || p.username}`, url: p.url }));
  return {
    success: true,
    category: "osint",
    scanType: "identity-graph-recon",
    summary: `Berhasil memetakan rekon identitas untuk ${target.rawQuery}. Confidence: ${confidence.confidenceLevel}`,
    visualIntelligence: {
      detected_entities: [target.username ? `Username: @${target.username}` : `Target: ${target.rawQuery}`],
      google_search_matches: matches,
      geolocation: {
        formatted_address: aiAnalysis,
        coordinates: target.username || target.name || "Identity Pivot",
        confidence: confidence.confidenceLevel,
        maps_url: ""
      }
    },
    identityGraph: graph,
    correlation,
    confidence,
    logs: [
      `[OSINT-INIT] Target normalizer memproses: ${target.rawQuery}`,
      `[COLLECTOR] Mengumpulkan profil publik dari GitHub, Reddit, GitLab, dan web.`,
      `[GRAPH] Membangun identity graph dengan ${profiles.length} profil terkait.`,
      `[CONFIDENCE] Confidence engine menentukan tingkat kepercayaan: ${confidence.confidenceLevel}.`,
      `[SUCCESS] Laporan dossier OSINT intelijen berhasil disusun.`
    ],
    limitations: "Pencarian jejak digital dilakukan secara publik tanpa meretas privasi pengguna."
  };
}

module.exports = { generateIdentityReport };
