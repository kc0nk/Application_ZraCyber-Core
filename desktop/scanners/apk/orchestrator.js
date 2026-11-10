const { validateApkSample } = require("./validator");
const { runSecurityRuleEngine } = require("./rules");
const { correlateApkWithAi } = require("../../ai/apk-correlator");
const { generateApkReport } = require("../../reports/apk-report");

async function runApkOrchestrator(sample, apiKey) {
  const validation = validateApkSample(sample);
  if (!validation.valid) throw new Error("Validasi file APK gagal.");

  const engineResult = runSecurityRuleEngine(sample.data, sample.name || "target.apk");
  const correlatedFindings = await correlateApkWithAi(engineResult, apiKey);
  const report = generateApkReport(engineResult, correlatedFindings);

  return report;
}

module.exports = { runApkOrchestrator };
