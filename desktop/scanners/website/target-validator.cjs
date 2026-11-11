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

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Skema URL hanya mendukung HTTP dan HTTPS.");
  }

  return { valid: true, url: parsed.toString(), hostname: parsed.hostname, origin: parsed.origin, protocol: parsed.protocol };
}

module.exports = { validateWebsiteTarget };
