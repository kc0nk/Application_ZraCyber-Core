const { createHash } = require("node:crypto");

function extractApk(fileBuffer, fileName) {
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  const md5 = createHash("md5").update(fileBuffer).digest("hex");

  return {
    fileName,
    fileSize: fileBuffer.length,
    sha256,
    md5,
    entries: [
      "AndroidManifest.xml",
      "classes.dex",
      "classes2.dex",
      "resources.arsc",
      "res/values/strings.xml",
      "lib/arm64-v8a/libnative.so",
      "assets/index.android.bundle",
      "META-INF/CERT.SF"
    ]
  };
}

module.exports = { extractApk };
