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
  const scanMode = body.scanMode === "internal" || body.scanMode === "authenticated" ? "internal" : "external";

  let scanResult;
  let findings = [];
  if (scanMode === "internal") {
    scanResult = await runInternalScan(target, {
      sshUser: body.sshUser,
      sshPassword: body.sshPassword,
      expectedHostFingerprint: body.expectedHostFingerprint,
    });
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
  const labSimulation = Boolean(scanMode === "external" && scanResult.labProfile);

  return {
    success: true,
    scanType: scanMode === "internal" ? "vps-internal-authenticated-audit" : "vps-external-attack-surface",
    summary: labSimulation
      ? `Simulasi VPS Lab berhasil dianalisis untuk target ${target.ip}:${target.port}. Temuan simulasi ditampilkan bersama observasi port.`
      : `Inspeksi VPS (${scanMode === "internal" ? "Dengan Login" : "Tanpa Login"}) berhasil diselesaikan untuk target ${target.ip}:${target.port}.`,
    limitations: labSimulation
      ? "Laporan ini menggabungkan observasi koneksi lokal dengan indikator dari fixture simulasi VPS Lab; anomali fixture bukan hasil pemeriksaan host nyata."
      : "Inspeksi dilakukan melalui discovery jaringan riil dan interpretasi rule engine.",
    labSimulation,
    authenticated: scanMode === "internal" ? Boolean(scanResult.authenticated) : false,
    ...(scanMode === "internal" ? { user: scanResult.user, hostFingerprint: scanResult.hostFingerprint } : {}),
    evidence: scanResult.evidence,
    stats: riskResult.stats,
    vulnerabilities: findings,
    logs: [
      `[VPS-INIT] Memulai pemindaian VPS mode: ${scanMode} pada ${target.ip}:${target.port}`,
      `[DISCOVERY] Berhasil mengumpulkan ${scanResult.evidence.length} indikator bukti.`,
      ...(labSimulation ? [`[LAB] Profil simulasi '${scanResult.labProfile.hostname || "VPS Lab"}' dimuat dari endpoint lokal /target.`] : []),
      `[RULE-ENGINE] Ditemukan ${findings.length} temuan kerentanan server.`,
      `[SUCCESS] Laporan audit VPS berhasil disusun.`
    ]
  };
}

module.exports = { runVpsOrchestrator };
