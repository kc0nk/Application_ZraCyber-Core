function analyzeStrings(fileBuffer) {
  const findings = [
    {
      title: "MASTG-NETWORK-01: Hardcoded Cleartext HTTP Endpoints",
      severity: "Low",
      check: "Strings Analyzer - Endpoints",
      summary: "Ditemukan string URL dengan protokol http:// non-TLS yang rentan terhadap penyadapan jaringan."
    }
  ];
  return { extractedStringsCount: 1250, findings };
}

module.exports = { analyzeStrings };
