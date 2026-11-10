function validateFile(file) {
  if (!file || !file.data) {
    throw new Error("Berkas file tidak ditemukan atau kosong.");
  }
  const maxBytes = 3 * 1024 * 1024 * 1024;
  if (file.data.length > maxBytes) {
    throw new Error("Ukuran berkas melebihi batas maksimum 3 GB.");
  }
  return { valid: true, size: file.data.length };
}

module.exports = { validateFile };
