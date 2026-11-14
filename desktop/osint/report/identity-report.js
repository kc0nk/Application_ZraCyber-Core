function generateIdentityReport(target, profiles, graph, correlation, confidence, aiAnalysis) {
  const matches = profiles.map(p => ({
    title: p.evidence?.displayName?.includes("[PDF]") ? p.evidence.displayName : `${p.platform} - ${p.evidence?.displayName || p.username || target.rawQuery}`,
    url: p.url,
    status: p.status,
    platform: p.platform
  }));
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
      `[COLLECTOR] Mengumpulkan profil publik & dokumen PDF arsip dari GitHub, Reddit, Scribd, dan direktori.`,
      `[GRAPH] Membangun identity graph dengan ${profiles.length} profil dan dokumen terkait.`,
      `[CONFIDENCE] Confidence engine menentukan tingkat kepercayaan: ${confidence.confidenceLevel}.`,
      `[SUCCESS] Laporan dossier OSINT intelijen berhasil disusun.`
    ],
    limitations: "Pencarian jejak digital dan dokumen publik dilakukan secara transparan tanpa meretas privasi pengguna."
  };
}

module.exports = { generateIdentityReport };
