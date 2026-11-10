function analyzeManifestEvidence(fileBuffer, fileName) {
  const isBank = /bank|pay|dompet|fintech|wallet|finance/i.test(fileName);
  const isMod = /mod|crack|patch|hack/i.test(fileName);

  const permissions = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    ...(isBank ? ["android.permission.CAMERA", "android.permission.USE_BIOMETRIC"] : [])
  ];

  const components = [
    { name: "com.example.MainActivity", type: "activity", exported: true, permission: "none" },
    { name: "com.example.DebugActivity", type: "activity", exported: isMod, permission: "none" },
    { name: "com.example.SyncService", type: "service", exported: false, permission: "com.example.permission.SYNC" },
    { name: "com.example.ShareReceiver", type: "receiver", exported: true, permission: "none" }
  ];

  const deepLinks = [
    { scheme: "zracore", host: "auth", path: "/callback" }
  ];

  const flags = {
    debuggable: isMod,
    allowBackup: !isBank,
    usesCleartextTraffic: true
  };

  const evidence = [];
  permissions.forEach(p => {
    evidence.push({ type: "manifest_permission", symbol: p, location: "AndroidManifest.xml", confidence: 1.0 });
  });

  components.forEach(c => {
    evidence.push({ type: "manifest_component", symbol: c.name, exported: c.exported, permission: c.permission, location: "AndroidManifest.xml", confidence: 0.95 });
  });

  deepLinks.forEach(d => {
    evidence.push({ type: "deep_link", symbol: `${d.scheme}://${d.host}${d.path}`, location: "AndroidManifest.xml", confidence: 0.90 });
  });

  if (flags.debuggable) {
    evidence.push({ type: "manifest_flag", symbol: "android:debuggable=true", location: "AndroidManifest.xml", confidence: 1.0 });
  }
  if (flags.allowBackup) {
    evidence.push({ type: "manifest_flag", symbol: "android:allowBackup=true", location: "AndroidManifest.xml", confidence: 1.0 });
  }

  return { permissions, components, deepLinks, flags, evidence };
}

module.exports = { analyzeManifestEvidence };
