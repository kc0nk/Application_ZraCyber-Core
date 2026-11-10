const { createHash } = require("node:crypto");

function computeHashes(buffer) {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const md5 = createHash("md5").update(buffer).digest("hex");
  const sha1 = createHash("sha1").update(buffer).digest("hex");
  return { sha256, md5, sha1 };
}

module.exports = { computeHashes };
