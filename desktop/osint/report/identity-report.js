function generateIdentityReport(target, profiles, graph, correlation, confidence, aiAnalysis) {
  const matches = profiles.map(p => ({
<<<<<<< HEAD
    title: p.evidence?.displayName?.includes("[PDF]") ? p.evidence.displayName : `${p.platform} - ${p.evidence?.displayName || p.username || target.rawQuery}`,
    url: p.url,
    status: p.status,
    platform: p.platform
  }));
=======
    title: `${p.platform} - ${p.evidence?.displayName || target.rawQuery}`,
    url: p.url,
    status: p.status || "UNVERIFIED"
  }));

>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8
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
<<<<<<< HEAD
      `[OSINT-INIT] Target normalizer memproses: ${target.rawQuery}`,
      `[COLLECTOR] Mengumpulkan profil publik & dokumen PDF arsip dari GitHub, Reddit, Scribd, dan direktori.`,
      `[GRAPH] Membangun identity graph dengan ${profiles.length} profil dan dokumen terkait.`,
      `[CONFIDENCE] Confidence engine menentukan tingkat kepercayaan: ${confidence.confidenceLevel}.`,
      `[SUCCESS] Laporan dossier OSINT intelijen berhasil disusun.`
    ],
    limitations: "Pencarian jejak digital dan dokumen publik dilakukan secara transparan tanpa meretas privasi pengguna."
=======
      `[OSINT-INIT] Target normalizer memproses: ${target.rawQuery} (Type: ${target.searchType})`,
      `[COLLECTOR] Memindai matriks platform publik (GitHub, Reddit, GitLab, HuggingFace, dll.).`,
      `[GRAPH] Membangun identity graph dari evidence terverifikasi.`,
      `[CONFIDENCE] Confidence engine menghitung skor berbasis bobot: ${confidence.score} (${confidence.confidenceLevel}).`,
      `[SUCCESS] Laporan dossier OSINT intelijen faktual berhasil disusun.`
    ],
    limitations: "Pencarian jejak digital dilakukan secara publik dan berbasis evidence terverifikasi tanpa asumsi spekulatif."
>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8
  };
}

module.exports = { generateIdentityReport };
