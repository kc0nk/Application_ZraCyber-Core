function validateVpsTarget(target) {
  if (!target || !target.targetIp) {
    throw new Error("Target IP atau Domain VPS wajib diisi.");
  }
  const ip = target.targetIp.trim();
  const port = Number(target.port) || 22;
  if (port < 1 || port > 65535) {
    throw new Error("Nomor port harus berada di antara 1 dan 65535.");
  }
  return { valid: true, ip, port };
}

module.exports = { validateVpsTarget };
