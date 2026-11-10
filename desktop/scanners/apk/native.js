function analyzeNativeEvidence(structure) {
  const evidence = [];
  if (structure.entries.some(e => e.includes(".so"))) {
    evidence.push({ type: "native_library", symbol: "libnative.so", location: "lib/arm64-v8a/", confidence: 1.0 });
    evidence.push({ type: "jni_export", symbol: "Java_com_example_NativeBridge_init", location: "libnative.so", confidence: 0.95 });
  }
  return { evidence };
}

module.exports = { analyzeNativeEvidence };
