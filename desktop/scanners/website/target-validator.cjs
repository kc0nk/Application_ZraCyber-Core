function validateWebsiteTarget(targetUrl, scopeConfirmed) {
  if (!targetUrl || !targetUrl.trim()) {
    throw new Error("Target URL web wajib diisi.");
  }
  if (!scopeConfirmed) {
    throw new Error("Konfirmasi scope dan kewenangan audit wajib dicentang.");
  }
  let parsed;
  try {
    parsed = new URL(targetUrl.trim().startsWith("http") ? targetUrl.trim() : `http://${targetUrl.trim()}`);
  } catch {
    throw new Error("Format URL target tidak valid.");
  }
  return { valid: true, url: parsed.toString(), hostname: parsed.hostname, origin: parsed.origin };
}

module.exports = { validateWebsiteTarget };
