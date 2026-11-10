const { validateFile } = require("../../core/file-validator.cjs");
const { computeHashes } = require("../../core/hash-engine.cjs");
const { detectMimeType } = require("../../core/mime-detector.cjs");
const { buildEvidenceGraph } = require("../../core/evidence-graph.cjs");
const { applySecurityRules } = require("../../core/security-rules.cjs");
const { calculateRisk } = require("../../core/risk-engine.cjs");
const { generateReportObject } = require("../../core/report-generator.cjs");

function runFileOrchestrator(file) {
  validateFile(file);
  const hashes = computeHashes(file.data);
  const mime = detectMimeType(file.data, file.name);

  const textContent = file.data.toString("utf8");
  const evidenceList = [];

  if (textContent.includes("eval(") || textContent.includes("system(") || textContent.includes("base64_decode")) {
    evidenceList.push({
      type: "ioc",
      title: "Embedded Shell / Webshell Backdoor Payload",
      severity: "Critical",
      cwe: "CWE-94",
      symbol: "eval/system/base64_decode detected",
      location: file.name,
      check: "Content Analyzer - Webshell",
      summary: "Terdeteksi pola skrip eksekusi perintah atau dekode base64 yang menyerang backend/web server (webshell)."
    });
  } else {
    evidenceList.push({
      type: "info",
      title: "Clean File Content Structure",
      severity: "Info",
      cwe: "CWE-0",
      symbol: "No high-risk shell payloads detected",
      location: file.name,
      check: "Content Analyzer - Clean",
      summary: "Struktur isi file tidak menunjukkan indikator malware atau webshell aktif."
    });
  }

  const graph = buildEvidenceGraph(evidenceList);
  const findings = applySecurityRules(evidenceList);
  const riskResult = calculateRisk(findings);

  const report = generateReportObject(
    { fileName: file.name || "artifact.bin", size: file.data.length, hashes, mime },
    riskResult,
    graph,
    findings
  );

  return report;
}

module.exports = { runFileOrchestrator };
