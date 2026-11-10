function generateApkReport(engineResult, correlatedFindings) {
  const crit = correlatedFindings.filter(f => (f.severity || "").toLowerCase() === "critical").length;
  const high = correlatedFindings.filter(f => (f.severity || "").toLowerCase() === "high").length;
  const med = correlatedFindings.filter(f => (f.severity || "").toLowerCase() === "medium").length;
  const low = correlatedFindings.filter(f => (f.severity || "").toLowerCase() === "low").length;
  const info = correlatedFindings.filter(f => (f.severity || "").toLowerCase() === "informational" || (f.severity || "").toLowerCase() === "info").length;

  return {
    success: true,
    scanType: "mastg-static-analysis-modular",
    summary: `Inspeksi statis biner ${engineResult.structure.fileName} (${(engineResult.structure.fileSize / (1024 * 1024)).toFixed(2)} MB) selesai. Ditemukan ${correlatedFindings.length} observasi kerentanan.`,
    limitations: "Analisis dilakukan secara statis melalui ekstraksi arsip ZIP, pemindaian AndroidManifest, DEX APIs, dan Native ELF symbols.",
    file: {
      name: engineResult.structure.fileName,
      size: engineResult.structure.fileSize,
      sha256: engineResult.structure.sha256
    },
    stats: { critical: crit, high, medium: med, low, info, total: correlatedFindings.length },
    vulnerabilities: correlatedFindings,
    logs: [
      `[APK-EXTRACT] Arsip ${engineResult.structure.fileName} berhasil diurai. SHA256: ${engineResult.structure.sha256.slice(0, 16)}...`,
      `[MANIFEST] Pemeriksaan izin dan komponen ter-export selesai.`,
      `[RULE-ENGINE] Evaluasi aturan keamanan MASTG selesai (${correlatedFindings.length} temuan).`,
      `[SUCCESS] Laporan audit biner berhasil disusun.`
    ]
  };
}

module.exports = { generateApkReport };
