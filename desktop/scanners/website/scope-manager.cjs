function checkScope(targetUrl, allowedOrigin) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.origin !== allowedOrigin) {
      throw new Error(`Target URL ${targetUrl} ditolak karena berada di luar origin scope yang diizinkan (${allowedOrigin}).`);
    }
  } catch (err) {
    if (err.message.includes("ditolak")) throw err;
    throw new Error("URL berada di luar scope yang diotorisasi.");
  }
  return { inScope: true, origin: allowedOrigin };
}

module.exports = { checkScope };
