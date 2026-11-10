const { extractApk } = require("./extractor");
const { analyzeManifestEvidence } = require("./manifest");
const { analyzeDexEvidence } = require("./dex");
const { analyzeNativeEvidence } = require("./native");
const { analyzeSecretsEvidence } = require("./secrets");
const { analyzeWebviewEvidence } = require("./webview");

function runSecurityRuleEngine(fileBuffer, fileName) {
  const structure = extractApk(fileBuffer, fileName);
  const manifest = analyzeManifestEvidence(fileBuffer, fileName);
  const dex = analyzeDexEvidence(fileBuffer);
  const native = analyzeNativeEvidence(structure);
  const secrets = analyzeSecretsEvidence(fileBuffer);
  const webview = analyzeWebviewEvidence();

  const allEvidence = [
    ...manifest.evidence,
    ...dex.evidence,
    ...native.evidence,
    ...secrets.evidence,
    ...webview.evidence
  ];

  const findings = [];

  const hasRuntimeExec = allEvidence.some(e => e.symbol === "Runtime.exec");
  if (hasRuntimeExec) {
    findings.push({
      title: "Potential Command Injection Sink (Runtime.exec)",
      severity: "High",
      cwe: "CWE-78",
      evidence: ["Runtime.exec found in classes.dex"],
      location: "classes.dex",
      check: "Rule Engine - RCE",
      summary: "Ditemukan pemanggilan Runtime.exec yang dapat menjadi sink command injection jika parameter berasal dari input eksternal."
    });
  }

  const hasWebviewJS = allEvidence.some(e => e.symbol === "setJavaScriptEnabled(true)");
  const hasAddJSInterface = allEvidence.some(e => e.symbol === "addJavascriptInterface");
  if (hasWebviewJS && hasAddJSInterface) {
    findings.push({
      title: "Potential Insecure WebView Configuration (Remote Code Execution)",
      severity: "Critical",
      cwe: "CWE-749",
      evidence: ["setJavaScriptEnabled(true)", "addJavascriptInterface"],
      location: "classes.dex",
      check: "Rule Engine - WebView RCE",
      summary: "Konfigurasi WebView mengaktifkan JavaScript bersama addJavascriptInterface pada API level lama, berisiko terhadap remote code execution via reflection."
    });
  }

  const hasDebuggable = allEvidence.some(e => e.symbol === "android:debuggable=true");
  if (hasDebuggable) {
    findings.push({
      title: "Application Debuggable Enabled",
      severity: "Critical",
      cwe: "CWE-215",
      evidence: ["android:debuggable=true"],
      location: "AndroidManifest.xml",
      check: "Rule Engine - Manifest",
      summary: "Aplikasi dikompilasi dengan flag debuggable aktif, memungkinkan proses aplikasi di-attach oleh debugger eksternal."
    });
  }

  const hasSecret = allEvidence.some(e => e.type === "secret_candidate");
  if (hasSecret) {
    findings.push({
      title: "Hardcoded API Secret / Token in Code",
      severity: "Critical",
      cwe: "CWE-798",
      evidence: ["Hardcoded secret pattern in DEX/Resources"],
      location: "classes.dex",
      check: "Rule Engine - Secrets",
      summary: "Terdeteksi string berformat API Secret / Token yang disematkan langsung di dalam biner aplikasi."
    });
  }

  return { structure, manifest, allEvidence, findings };
}

module.exports = { runSecurityRuleEngine };
