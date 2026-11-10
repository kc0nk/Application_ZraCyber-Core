function analyzePermissions(permissions) {
  const dangerous = permissions.filter(p => p.includes("READ_CONTACTS") || p.includes("CAMERA") || p.includes("WRITE_EXTERNAL_STORAGE") || p.includes("ACCESS_FINE_LOCATION"));
  const findings = [];
  if (dangerous.length > 0) {
    findings.push({
      title: "MASTG-PLATFORM-01: Sensitive Permissions Requested",
      severity: "Medium",
      check: "Permissions Analyzer",
      summary: `Aplikasi meminta ${dangerous.length} izin sensitif yang berisiko menyalahgunakan privasi pengguna.`
    });
  }
  return { dangerousCount: dangerous.length, findings };
}

module.exports = { analyzePermissions };
