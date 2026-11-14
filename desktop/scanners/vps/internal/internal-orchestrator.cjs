const { connectSsh } = require("./ssh-connector.cjs");

async function runInternalScan(target, credentials) {
  const connection = await connectSsh(target, credentials);

  if (!connection.connected || !connection.authenticated) {
    throw new Error(`Gagal melakukan audit internal SSH pada ${target.ip}:${target.port}. ${connection.error || "Server menolak koneksi"}.`);
  }

  const evidence = [
    { type: "ssh_banner", symbol: connection.banner || "SSH server did not provide a notice banner.", location: `${target.ip}:${target.port}`, confidence: connection.banner ? 1.0 : 0.5 },
    { type: "auth_status", symbol: `SSH user ${connection.username} authenticated successfully`, location: "SSH Service", confidence: 1.0 },
    { type: "ssh_config", symbol: connection.evidence.sshConfig.output || "sshd -T tidak mengembalikan konfigurasi; periksa izin atau instalasi OpenSSH.", location: "sshd -T", confidence: connection.evidence.sshConfig.exitCode === 0 ? 1 : 0.5 },
    { type: "firewall_status", symbol: connection.evidence.firewall.output || connection.evidence.firewall.errorOutput || "Status firewall tidak tersedia.", location: "Firewall status command", confidence: connection.evidence.firewall.exitCode === 0 ? 1 : 0.5 },
    { type: "package_audit", symbol: connection.evidence.packageUpdates.output || connection.evidence.packageUpdates.errorOutput || "Status pembaruan paket tidak tersedia.", location: "Package manager", confidence: connection.evidence.packageUpdates.exitCode === 0 ? 1 : 0.5 },
    { type: "os_info", symbol: connection.evidence.os.output || "Informasi OS tidak tersedia.", location: "/etc/os-release", confidence: connection.evidence.os.exitCode === 0 ? 1 : 0.5 },
  ];

  return { scanMode: "internal", ip: target.ip, user: connection.username, authenticated: true, hostFingerprint: connection.hostFingerprint, evidence };
}

module.exports = { runInternalScan };
