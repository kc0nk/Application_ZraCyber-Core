const { connectSsh } = require("./ssh-connector.cjs");

async function runInternalScan(target, credentials) {
  const connection = await connectSsh(target, credentials);

  if (!connection.connected) {
    throw new Error(`Gagal melakukan audit internal SSH pada ${target.ip}:${target.port}. ${connection.error || "Server menolak koneksi"}.`);
  }

  const evidence = [
    { type: "ssh_banner", symbol: connection.banner || "SSH-2.0 Service Active", location: `${target.ip}:${target.port}`, confidence: 1.0 },
    { type: "auth_attempt", symbol: `SSH User: ${credentials.sshUser || "root"}`, location: "SSH Service", confidence: 1.0 }
  ];

  return { scanMode: "internal", ip: target.ip, user: credentials.sshUser || "root", evidence };
}

module.exports = { runInternalScan };
