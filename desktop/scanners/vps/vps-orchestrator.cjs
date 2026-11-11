const { validateVpsTarget } = require("./target-validator.cjs");
const { runExternalScan } = require("./external/external-orchestrator.cjs");
const { runInternalScan } = require("./internal/internal-orchestrator.cjs");
const { applyExternalRules } = require("./rules/external-rules.cjs");
const { applySshRules } = require("./rules/ssh-rules.cjs");
const { applyLinuxRules } = require("./rules/linux-rules.cjs");
const { applySecurityRules } = require("../../core/security-rules.cjs");
const { calculateRisk } = require("../../core/risk-engine.cjs");

async function runVpsOrchestrator(body, apiKey) {
  const target = validateVpsTarget({ targetIp: body.targetIp, port: body.port });
  const scanMode = body.scanMode === "internal" ? "internal" : "external";

  let scanResult;
  let findings = [];
  if (scanMode === "internal") {
    scanResult = await runInternalScan(target, { sshUser: body.sshUser, sshPassword: body.sshPassword });
    const sshF = applySshRules(scanResult);
    const linF = applyLinuxRules(scanResult);
    const coreF = applySecurityRules(scanResult.evidence);
    findings.push(...sshF, ...linF, ...coreF);
  } else {
    scanResult = await runExternalScan(target.ip, target.port);
    const extF = applyExternalRules(scanResult);
    const coreF = applySecurityRules(scanResult.evidence);
    findings.push(...extF, ...coreF);
  }

  const riskResult = calculateRisk(findings);

  return {
    success: true,
    scanType: scanMode === "internal" ? "vps-internal-authenticated-audit" : "vps-external-attack-surface",
    summary: `Inspeksi VPS (${scanMode === "internal" ? "Dengan Login" : "Tanpa Login"}) berhasil diselesaikan untuk target ${target.ip}:${target.port}.`,
    limitations: "Inspeksi dilakukan melalui discovery jaringan riil dan interpretasi rule engine.",
    stats: riskResult.stats,
    vulnerabilities: findings,
    logs: [
      `[VPS-INIT] Memulai pemindaian VPS mode: ${scanMode} pada ${target.ip}:${target.port}`,
      `[DISCOVERY] Berhasil mengumpulkan ${scanResult.evidence.length} indikator bukti.`,
      `[RULE-ENGINE] Ditemukan ${findings.length} temuan kerentanan server.`,
      `[SUCCESS] Laporan audit VPS berhasil disusun.`
    ]
  };
}

module.exports = { runVpsOrchestrator };
