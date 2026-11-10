const path = require("node:path");

function detectMimeType(buffer, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (buffer.length > 4) {
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return { mime: "application/pdf", category: "document" };
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return { mime: "application/zip", category: "archive" };
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { mime: "image/png", category: "image" };
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", category: "image" };
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) return { mime: "application/x-msdownload", category: "binary" };
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return { mime: "application/x-executable", category: "binary" };
  }

  const docExts = [".pdf", ".doc", ".docx", ".odt", ".rtf", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".json", ".xml", ".html"];
  const imageExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".svg"];
  const archiveExts = [".zip", ".rar", ".7z", ".tar", ".gz"];
  const binaryExts = [".exe", ".dll", ".elf", ".so"];
  const scriptExts = [".js", ".ts", ".py", ".php", ".sh", ".bat", ".ps1"];

  if (docExts.includes(ext)) return { mime: `application/${ext.slice(1)}`, category: "document" };
  if (imageExts.includes(ext)) return { mime: `image/${ext.slice(1)}`, category: "image" };
  if (archiveExts.includes(ext)) return { mime: `application/${ext.slice(1)}`, category: "archive" };
  if (binaryExts.includes(ext)) return { mime: `application/octet-stream`, category: "binary" };
  if (scriptExts.includes(ext)) return { mime: `text/plain`, category: "script" };

  return { mime: "application/octet-stream", category: "binary" };
}

module.exports = { detectMimeType };
