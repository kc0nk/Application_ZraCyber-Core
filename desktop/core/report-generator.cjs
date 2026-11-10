function generateReportObject(meta, riskResult, graph, findings) {
  return {
    success: true,
    scanType: "deep-file-artifact-analysis",
    summary: `Analisis mendalam file ${meta.fileName} (${(meta.size / (1024 * 1024)).toFixed(2)} MB) selesai. Risiko: ${riskResult.riskLevel} (Skor: ${riskResult.riskScore}).`,
    limitations: "Analisis dilakukan secara statis melalui engine hash, MIME detector, IOC scanner, dan rule correlation.",
    file: {
      name: meta.fileName,
      size: meta.size,
      sha256: meta.hashes.sha256,
      md5: meta.hashes.md5,
      mime: meta.mime.mime,
      category: meta.mime.category
    },
    risk: riskResult,
    stats: riskResult.stats,
    evidenceGraph: graph,
    vulnerabilities: findings,
    logs: [
      `[HASH] SHA256: ${meta.hashes.sha256}`,
      `[MIME] Terdeteksi kategori: ${meta.mime.category} (${meta.mime.mime})`,
      `[RULE-ENGINE] Ditemukan ${findings.length} observasi temuan keamanan.`,
      `[SUCCESS] Laporan audit artefak file berhasil disusun.`
    ]
  };
}

module.exports = { generateReportObject };
