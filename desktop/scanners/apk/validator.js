const path = require("node:path");

function validateApkSample(file) {
  if (!file || !file.data) {
    throw new Error("Berkas APK/AAB tidak ditemukan atau kosong.");
  }
  const name = file.name || "unknown.apk";
  const ext = path.extname(name).toLowerCase();
  if (![".apk", ".aab", ".ipa", ".exe"].includes(ext)) {
    throw new Error(`Format file .${ext} tidak didukung untuk APK Security Scanner.`);
  }
  if (file.data.length > 200 * 1024 * 1024) {
    throw new Error("Ukuran berkas melebihi batas maksimum 200 MiB.");
  }
  if ([".apk", ".aab"].includes(ext)) {
    const isZip = file.data.length > 4 && file.data[0] === 0x50 && file.data[1] === 0x4b;
    if (!isZip) {
      throw new Error("File APK/AAB tidak valid (magic bytes ZIP tidak ditemukan).");
    }
  }
  return { valid: true, name, size: file.data.length, extension: ext };
}

module.exports = { validateApkSample };
