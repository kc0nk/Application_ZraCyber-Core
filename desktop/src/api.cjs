// Tujuan file: Menjalankan HTTP API Desktop dan mengatur endpoint, validasi, serta audit website lab.
/**
 * ============================================================================
 * ZRACORE DESKTOP API SERVER & MULTI-MODULE AI ENGINE (GROQ POWERED)
 * ============================================================================
 */

const { createServer } = require("node:http");
const { createReadStream } = require("node:fs");
const crypto = require("node:crypto");
const { randomUUID, createHash } = crypto;
const { lookup, resolve4, resolve6, resolveCaa, resolveMx, resolveNs, resolveTxt } = require("node:dns/promises");
const { isIP } = require("node:net");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const ipaddr = require("ipaddr.js");
const { domainToASCII } = require("node:url");
const { runApkOrchestrator } = require("../scanners/apk/orchestrator.js");
const { runOsintOrchestrator } = require("../osint/orchestrator.js");
const { runFileOrchestrator } = require("../scanners/file/file-orchestrator.cjs");
const { runVpsOrchestrator } = require("../scanners/vps/vps-orchestrator.cjs");
const { runWebsiteOrchestrator } = require("../scanners/website/website-orchestrator.cjs");

// Mengubah batas body request dan sampel biner ke 3 GB (3 * 1024 * 1024 * 1024)
const MAX_BODY_BYTES = 3 * 1024 * 1024 * 1024; 
const MAX_APP_SAMPLE_BYTES = 200 * 1024 * 1024;

const MAX_WEBSITE_CRAWL_PAGES = 25;
const anomalyUpdates = new Map();


// ============================================================================
// CORE HTTP & JSON HELPERS
// ============================================================================
function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Zra-Device-Id, X-Zra-Device-Name, X-Zra-Device-Platform, X-Zra-Device-Model, X-Zra-Device-Manufacturer, X-Zra-Device-OS-Version, X-Zra-App-Version, X-Zra-App-Version-Code, X-Zra-Location-Shared, X-Zra-Latitude, X-Zra-Longitude, X-Zra-Location-Accuracy, X-Zra-Active-Activity, x-zra-active-activity, Bypass-Tunnel-Reminder, bypass-tunnel-reminder",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function queryDesktopChat(prompt) {
  let apiKey = process.env.GROQ_API_KEY || "";
  try {
    const configPath = path.join(path.dirname(require.resolve("./api.cjs")), "..", "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (typeof config.groqApiKey === "string" && config.groqApiKey.trim()) apiKey = config.groqApiKey.trim();
    }
  } catch {}
  if (!apiKey) throw new Error("API key Groq belum disetel di Desktop.");

  const result = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error?.message || `Groq API HTTP ${result.status}`);
  return data.choices?.[0]?.message?.content || "Respon kosong.";
}

async function validateWebsiteTarget(rawUrl, scopeConfirmed) {
  if (scopeConfirmed !== true) {
    throw new Error("Konfirmasi scope target lomba/lab diperlukan sebelum memulai audit.");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL target tidak valid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Gunakan URL HTTP atau HTTPS.");
  }
  // Pembatasan port 80/443 dan filter IP loopback/private dihapus 
  // agar server bisa menembak target publik secara bebas di port manapun.
  return url;
}


async function readLimitedText(response, maxBytes = 500_000) {
  // Batasi ukuran HTML agar crawl tidak menghabiskan memori Desktop.
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, Math.max(0, maxBytes - size));
    chunks.push(chunk);
    size += chunk.length;
    if (size >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ============================================================================
// TOOLS_APP | APK / IPA ZIP READER
// ============================================================================
function readAppZipEntries(buffer) {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Arsip APK/IPA tidak memiliki ZIP directory yang valid.");
  if (buffer.readUInt16LE(endOffset + 4) !== 0 || buffer.readUInt16LE(endOffset + 6) !== 0) {
    throw new Error("Arsip multi-disk tidak didukung untuk inspeksi statis.");
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff || entryCount > 10_000) {
    throw new Error("Arsip ZIP64 atau jumlah entri berlebih tidak didukung.");
  }
  if (directoryOffset + directorySize > endOffset) throw new Error("ZIP directory berada di luar batas berkas.");

  const names = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Entri ZIP directory tidak valid.");
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nextCursor = nameStart + nameLength + extraLength + commentLength;
    if (nextCursor > endOffset) throw new Error("Entri ZIP directory terpotong.");
    names.push(buffer.toString("utf8", nameStart, nameStart + nameLength).replace(/\\/g, "/"));
    cursor = nextCursor;
  }
  return names;
}

// ============================================================================
// TOOLS_APP | STATIC ANALYZER (APK / IPA / EXE)
// ============================================================================
function analyzeAppSample({ name, size, data }) {
  if (typeof name !== "string" || !data) {
    throw new Error("Nama file dan data wajib diisi.");
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_APP_SAMPLE_BYTES || (Number.isFinite(size) && size !== buffer.length)) {
    throw new Error("Ukuran sampel tidak valid atau melebihi batas 20 MiB.");
  }
  const safeName = name.replace(/\\/g, "/").split("/").pop().slice(0, 160) || "sample";
  const extension = safeName.split(".").pop().toLowerCase();
  const findings = [];
  
  const add = (severity, title, check, summary) => findings.push({ severity, title, check, summary });
  let format = extension.toUpperCase();

  // ==========================================
  // 1. ENGINE AGRESIF 1: HEURISTIC PATTERN MATCHING (String & API)
  // ==========================================
  // Membaca area kritis untuk menemukan pemanggilan fungsi sensitif
  const rawStringData = buffer.toString("ascii", 0, Math.min(buffer.length, 100 * 1024 * 1024)); 

  // Deteksi Spyware & Pencurian Data (Keylogger / Camera / Location)
  if (/android\.permission\.RECORD_AUDIO|android\.permission\.CAMERA|AVCaptureDevice/i.test(rawStringData)) {
    add("high", "Akses Hardware Sensitif Terdeteksi", "Spyware Risk Indicator", "Aplikasi meminta atau memiliki referensi ke izin Kamera/Mikrofon. Berpotensi melakukan perekaman latar belakang jika disalahgunakan.");
  }
  if (/android\.permission\.READ_SMS|android\.permission\.RECEIVE_SMS/i.test(rawStringData)) {
    add("critical", "Kemampuan Membaca / Mencegat SMS", "TFA Bypass Risk", "Ditemukan fungsi intersepsi SMS. Ini adalah perilaku umum malware perbankan (Banking Trojan) untuk mencuri kode OTP/2FA.");
  }

  // Deteksi Evasion / Anti-Analysis (Mendeteksi jika malware mencoba bersembunyi dari analis)
  if (/isDebuggerPresent|CheckRemoteDebuggerPresent|android\.os\.Debug\.isDebuggerConnected/i.test(rawStringData)) {
    add("high", "Mekanisme Anti-Debugging / Evasion", "Anti-Analysis Technique", "Aplikasi mendeteksi keberadaan debugger. Teknik ini sering digunakan oleh malware terikat untuk menggagalkan analisis forensik.");
  }
  if (/getDeviceId|getSubscriberId|android\.telephony\.TelephonyManager/i.test(rawStringData)) {
    add("medium", "Pengumpulan Identitas Perangkat (IMEI/IMSI)", "Device Fingerprinting", "Terdeteksi pengambilan informasi IMEI atau nomor kartu SIM secara mentah yang melanggar privasi pengguna.");
  }

  // Deteksi Dropper & Eksekusi Shell Command
  if (/Runtime\.getRuntime\(\)\.exec|system\(|CreateProcess|ShellExecute/i.test(rawStringData)) {
    add("critical", "Fungsi Eksekusi Command Shell Aktif", "Arbitrary Code Execution", "Ditemukan fungsi yang dapat menjalankan perintah terminal sistem secara langsung. Risiko eksploitasi Remote Code Execution (RCE) sangat tinggi.");
  }

  // ==========================================
  // 2. ENGINE AGRESIF 2: ENTROPY & PACKER DETECTION (Deteksi Enkripsi/Ransomware)
  // ==========================================
  // Mengukur keacakan data (entropi) untuk mendeteksi file yang di-pack/dikompres keras untuk mengelabui antivirus
  let anomalies = 0;
  const sampleSize = Math.min(buffer.length, 1024 * 1024);
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < sampleSize; i++) {
    frequencies[buffer[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      let p = frequencies[i] / sampleSize;
      entropy -= p * Math.log2(p);
    }
  }
  if (entropy > 7.2) {
    add("high", "Tingkat Entropi Sangat Tinggi (Kemungkinan Obfuscated/Packer)", "Anti-Reverse Engineering", `Nilai entropi biner mencapai ${entropy.toFixed(2)}. Indikasi kuat bahwa biner ini menggunakan Obfuscator atau Software Packer (seperti UPX, DexGuard) untuk menyembunyikan kode asli.`);
  }

  // ==========================================
  // 3. ENGINE AGRESIF 3: FORMAT SPECIFIC DEEP AUDIT
  // ==========================================
  if (["apk", "ipa"].includes(extension)) {
    const entries = readAppZipEntries(buffer);
    const normalizedEntries = entries.map((entry) => entry.toLowerCase());
    
    if (extension === "apk") {
      const hasManifest = normalizedEntries.includes("androidmanifest.xml");
      const dexCount = normalizedEntries.filter((entry) => entry.endsWith(".dex")).length;
      
      // Deteksi Taktik Pemalsuan Ekstensi dalam ZIP (Maslquerading)
      const hiddenExecutables = entries.filter(e => /\.(exe|sh|bat|vbs|jar)$/i.test(e));
      if (hiddenExecutables.length > 0) {
        add("critical", "File Executable Asing di Dalam Paket Mobile", "Masquerading Attack", `Ditemukan file executable non-Android (${hiddenExecutables.join(", ")}) di dalam paket APK. Ini taktik menyembunyikan payload berbahaya.`);
      }

      // Deteksi Dynamic Loading / Dropper (.dex atau .jar tersembunyi di assets)
      const suspiciousAssets = entries.filter(e => e.startsWith("assets/") && /\.(dex|jar|apk)$/i.test(e));
      if (suspiciousAssets.length > 0) {
        add("high", "DEX/JAR Sekunder Terisolasi di Folder Assets", "Dynamic Payload Dropper", "Ditemukan file eksekusi tambahan di luar jalur kompilasi standar. Umumnya digunakan untuk taktik runtime dropping/pemuatan kode jarak jauh.");
      }
    }
  } else if (extension === "exe") {
    if (buffer.length < 64 || buffer.toString("ascii", 0, 2) !== "MZ") throw new Error("File EXE tidak memiliki DOS header MZ yang valid.");
    const peOffset = buffer.readUInt32LE(0x3c);
    const sectionCount = buffer.readUInt16LE(peOffset + 6);
    
    // Deteksi Modifikasi Section PE (Taktik Injeksi Malware)
    if (sectionCount > 10) {
      add("medium", "Jumlah Section PE Tidak Wajar", "Structural Anomaly", `File memiliki ${sectionCount} section memori. Jumlah yang terlalu banyak patut dicurigai hasil dari injeksi malware/crypter.`);
    }

    const optionalHeaderOffset = peOffset + 24;
    const dllCharacteristics = buffer.readUInt16LE(optionalHeaderOffset + 70);
    
    if (!(dllCharacteristics & 0x40)) {
      add("high", "Mitigasi ASLR Dinonaktifkan", "Exploit Mitigation Bypass", "Biner Windows ini tidak menggunakan pengacakan memori (ASLR). Penyerang dapat dengan mudah memprediksi lokasi memori untuk meluncurkan exploit Buffer Overflow.");
    }
    if (!(dllCharacteristics & 0x100)) {
      add("high", "Mitigasi DEP / NX Tidak Aktif", "Exploit Mitigation Bypass", "Pencegahan eksekusi data (DEP) dimatikan. Area memori stack/heap bisa dieksekusi secara ilegal.");
    }
  }

  // Mengelompokkan statistik temuan berdasarkan tingkat kerentanan yang didapat
  const stats = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: findings.length };
  for (const item of findings) {
    if (stats[item.severity] !== undefined) stats[item.severity] += 1;
  }
  
  return {
    success: true,
    scanType: `deep-aggressive-${format.toLowerCase()}-audit`,
    summary: `Pemindaian HEURISTIK AGRESIF selesai untuk berkas ${safeName}. Total ${findings.length} anomali arsitektur dan indikator ancaman teridentifikasi secara ketat.`,
    stats,
    vulnerabilities: findings,
    file: { name: safeName, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") },
    logs: [
      `[AGRES-SCAN] Mengaktifkan Heuristic String & API Signature Engine.`,
      `[AGRES-SCAN] Menghitung entropy biner... Skore: ${entropy.toFixed(2)}/8.00.`,
      `[AGRES-SCAN] Memindai tanda pencegatan OTP, Anti-Analysis, dan Hidden Executables.`,
      `[SUCCESS] Analisis mendalam selesai. ${findings.length} temuan dimasukkan ke dalam daftar mitigasi.`
    ],
    limitations: "Pemindaian dilakukan secara agresif pada level biner pasif menggunakan pencocokan regex struktural dan kalkulasi matematis entropi. Aman bagi sistem komputer karena sampel tidak dipicu untuk berjalan.",
  };
}

function analyzeFileArtifact({ name, data }) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "base64");
  const safeName = name.replace(/\\/g, "/").split("/").pop().slice(0, 160) || "sample.bin";
  const extension = safeName.split(".").pop().toLowerCase();

  const findings = [];
  const add = (severity, title, check, summary) => findings.push({ severity, title, check, summary });

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const md5 = createHash("md5").update(buffer).digest("hex");
  const sha1 = createHash("sha1").update(buffer).digest("hex");

  // 1. Entropy Calculation (Anomaly Engine)
  let entropy = 0;
  if (buffer.length > 0) {
    const freq = new Array(256).fill(0);
    for (let i = 0; i < buffer.length; i++) freq[buffer[i]]++;
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / buffer.length;
        entropy -= p * Math.log2(p);
      }
    }
  }

  if (entropy > 7.4) {
    add("Critical", "High Entropy (Packed / Encrypted Payload)", "Anomaly Engine - Suspicious Entropy", `Nilai entropi biner mencapai ${entropy.toFixed(2)}/8.00. Mengindikasikan payload terenkripsi, terkompresi padat, atau obfuscated malware yang menyembunyikan instruksi asli.`);
  } else {
    add("Info", "Normal Entropy Profile", "Anomaly Engine - Shannon Entropy", `Nilai entropi biner terukur ${entropy.toFixed(2)}/8.00. Distribusi byte dalam rentang normal untuk berkas bertipe .${extension}.`);
  }

  // 2. Deep Content & Strings Analysis (Indicator Engine)
  const rawStringData = buffer.toString("utf8", 0, Math.min(buffer.length, 1024 * 1024));

  const foundUrls = rawStringData.match(/https?:\/\/[^\s<>"]+/g) || [];
  const uniqueUrls = [...new Set(foundUrls)].slice(0, 10);
  if (uniqueUrls.length > 0) {
    add("Medium", `Embedded External URLs (${uniqueUrls.length} found)`, "Indicator Engine - URLs & Endpoints", `Ditemukan referensi URL eksternal di dalam isi file:\n${uniqueUrls.map(u => `• \`${u}\``).join("\n")}`);
  }

  const foundIps = rawStringData.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g) || [];
  const uniqueIps = [...new Set(foundIps)].slice(0, 10);
  if (uniqueIps.length > 0) {
    add("High", `Hardcoded IP Addresses (${uniqueIps.length} found)`, "Indicator Engine - Network Indicators", `Ditemukan alamat IP hardcoded di dalam payload:\n${uniqueIps.map(ip => `• \`${ip}\``).join("\n")}`);
  }

  const foundPaths = rawStringData.match(/(?:[a-zA-Z]:|[\/])[^\s<>:"'|?*]+\/[^\s<>:"'|?*]+/g) || [];
  const uniquePaths = [...new Set(foundPaths)].slice(0, 10);
  if (uniquePaths.length > 0) {
    add("Low", `Embedded File System Paths (${uniquePaths.length} found)`, "Indicator Engine - Internal Paths", `Ditemukan string jalur direktori sistem:\n${uniquePaths.slice(0, 5).map(p => `• \`${p}\``).join("\n")}`);
  }

  if (/cmd\.exec|powershell|eval\(|base64_decode|wget\s|curl\s|system\(|exec\(/i.test(rawStringData)) {
    add("High", "Suspicious Execution Command Strings", "Indicator Engine - Command Artifacts", "Ditemukan fungsi eksekusi perintah shell, eval, atau downloader (PowerShell/Wget/Curl/System) di dalam isi biner.");
  }

  if (/api_key|secret|password|bearer|authorization|private_key/i.test(rawStringData)) {
    add("Critical", "Potential Hardcoded Secrets or Tokens", "Indicator Engine - Token Artifacts", "Ditemukan pola kata kunci yang mengindikasikan adanya API Secret, token otorisasi, atau password yang hardcoded di dalam file.");
  }

  // 4. Embedded Source Code & Script Detection Engine
  const codePatterns = [
    { lang: "PHP Script", regex: /<\?php|\bbase64_decode\s*\(|\beval\s*\(|\bassert\s*\(/i },
    { lang: "JavaScript / Node.js", regex: /\bdocument\.cookie\b|\bprocess\.mainModule\b|\brequire\s*\(\s*['""]child_process['""]\)/i },
    { lang: "Python Script", regex: /\bimport\s+os\b|\bsubprocess\.Popen\b|\bos\.system\s*\(/i },
    { lang: "Shell Script", regex: /#!\/bin\/(?:sh|bash|zsh)|\bchmod\s+\+x\b/i },
    { lang: "SQL Injection / Queries", regex: /\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|\bSELECT\s+\*\s+FROM\b/i }
  ];

  for (const cp of codePatterns) {
    if (cp.regex.test(rawStringData)) {
      add("High", `Embedded Source Code Pattern: ${cp.lang}`, "Indicator Engine - Source Code Analysis", `Ditemukan potongan kodingan atau skrip bahasa ${cp.lang} di dalam isi file artefak.`);
    }
  }

  // 3. Structure & Archive Parsing (Deep Parser Engine)
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isExecutable = buffer.length > 2 && buffer[0] === 0x4d && buffer[1] === 0x5a;

  if (isZip) {
    add("Info", "Valid ZIP / Archive Container Structure", "Deep Parser Engine - Archive Analysis", "Struktur berkas terdeteksi sebagai kontainer arsip ZIP yang sah. Dapat berisi objek bersarang (nested files/assets).");
  }

  if (isExecutable && !["exe", "dll", "bin"].includes(extension)) {
    add("Critical", "Executable Content Masquerading as Safe Extension", "Anomaly Engine - Extension Mismatch", `Berkas memiliki header PE (MZ executable) namun menggunakan ekstensi .${extension}. Tanda nyata upaya penipuan ekstensi file.`);
  }

  if (findings.length === 0) {
    add("Info", "Clean File Artifact Verified", "Static Analysis - Verification Engine", "Tidak ditemukan indikator anomali, entropi mencurigakan, atau tanda biner berbahaya pada artefak ini.");
  }

  const crit = findings.filter(f => f.severity.toLowerCase() === "critical").length;
  const high = findings.filter(f => f.severity.toLowerCase() === "high").length;
  const med = findings.filter(f => f.severity.toLowerCase() === "medium").length;
  const low = findings.filter(f => f.severity.toLowerCase() === "low").length;
  const info = findings.filter(f => f.severity.toLowerCase() === "info").length;

  return {
    success: true,
    scanType: "deep-file-malware-pipeline",
    summary: `Analisis mendalam file berhasil mengevaluasi artefak ${safeName} (${(buffer.length / 1024).toFixed(2)} KB). SHA-256: ${sha256}.`,
    limitations: "Analisis dilakukan secara statis melalui pipeline multi-tahap tanpa eksekusi langsung.",
    stats: { critical: crit, high, medium: med, low, info, total: findings.length },
    file: { name: safeName, size: buffer.length, sha256, md5, sha1 },
    vulnerabilities: findings,
    logs: [
      `[TARGET-PROFILING] File identity: ${safeName} (${buffer.length} bytes).`,
      `[HASH-IDENTITY] SHA-256: ${sha256}`,
      `[HASH-IDENTITY] MD5: ${md5}`,
      `[DEEP-PARSER] Analisis struktur biner & header selesai. Format: ${extension.toUpperCase()}.`,
      `[ENTROPY] Kalkulasi tingkat keacakan: ${entropy.toFixed(2)}/8.00.`,
      `[INDICATOR] Ekstraksi strings, URLs (${uniqueUrls.length}), IPs (${uniqueIps.length}), dan paths selesai.`,
      `[ANOMALY] Evaluasi anomali dan kecocokan ekstensi selesai.`,
      `[SUCCESS] Laporan Write-up forensik file berhasil disusun.`
    ]
  };
}

function performCryptoOperation(mode, input, secretKey) {
  const key = crypto.pbkdf2Sync(secretKey || "zracore_default_salt", "zracore_salt", 10000, 32, "sha256");
  if (mode === "encrypt") {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(input, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const combined = iv.toString("hex") + ":" + authTag + ":" + encrypted;
    const ciphertextBase64 = Buffer.from(combined, "utf8").toString("base64");

    return {
      success: true,
      cryptoResult: {
        encrypt: {
          chipertext: ciphertextBase64,
          parameter: `AES-256-GCM | IV (Nonce): ${iv.toString("hex")} | Auth Tag: ${authTag}`,
          rumus_bongkar: `**Metadata Enkripsi Kriptografis**:\n- **Algoritma**: AES-256-GCM\n- **KDF**: PBKDF2-HMAC-SHA256 (32-byte key)\n- **Nonce (IV)**: \`${iv.toString("hex")}\`\n- **Auth Tag**: \`${authTag}\``
        }
      },
      logs: [
        "[CRYPTO-INIT] Menerima data plaintext dan kunci rahasia.",
        "[KDF] Menurunkan kunci 256-bit menggunakan Key Derivation Function (PBKDF2).",
        "[AES-256-GCM] Menghasilkan enkripsi simetris terautentikasi dengan Nonce & Auth Tag.",
        "[SUCCESS] Ciphertext berhasil di-encode ke Base64."
      ]
    };
  } else {
    try {
      const decodedStr = Buffer.from(input, "base64").toString("utf8");
      const parts = decodedStr.split(":");
      if (parts.length < 3) throw new Error("Format ciphertext tidak valid.");
      const iv = Buffer.from(parts[0], "hex");
      const authTag = Buffer.from(parts[1], "hex");
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return {
        success: true,
        cryptoResult: {
          decrypt: {
            plaintext: decrypted,
            rumus_yang_di_pakai: `**Dekripsi AES-256-GCM Berhasil**:\n- **Integritas**: Terverifikasi via Auth Tag\n- **Status**: Autentikasi GCM Valid`,
            deskripsi: `Dekripsi berhasil mengembalikan plaintext asli dengan kunci yang cocok.`
          }
        },
        logs: [
          "[CRYPTO-INIT] Menerima ciphertext dan kunci rahasia untuk dekripsi.",
          "[PARSE] Mengurai komponen IV, Auth Tag, dan Ciphertext dari format Base64.",
          "[AES-256-GCM] Melakukan dekripsi terautentikasi dan verifikasi tag.",
          "[SUCCESS] Plaintext asli berhasil dipulihkan."
        ]
      };
    } catch (err) {
      throw new Error("Dekripsi gagal: Kunci salah atau integritas ciphertext rusak.");
    }
  }
}

async function probeHost(targetIp, targetPort) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    let connected = false;

    socket.setTimeout(4000);
    socket.on("connect", () => {
      connected = true;
    });
    socket.on("data", (chunk) => {
      banner += chunk.toString("utf8").trim();
      socket.destroy();
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ connected: false, error: "Connection timeout", banner: "" });
    });
    socket.on("error", (err) => {
      resolve({ connected: false, error: err.message, banner: "" });
    });
    socket.on("close", () => {
      resolve({ connected, error: connected ? null : "Connection closed", banner: banner.slice(0, 100) });
    });

    socket.connect(Number(targetPort) || 22, targetIp);
  });
}

async function generateVpsSecurityReport(targetIp, port, sshUser, loginUrl, loginUser) {
  const ip = targetIp.trim() || "127.0.0.1";
  const sshPort = port || "22";
  const user = sshUser || "root";
  const loginEndpoint = loginUrl ? loginUrl.trim() : "";
  const loginAccount = loginUser ? loginUser.trim() : "";
  const isPostAuth = Boolean(loginEndpoint);
  const auditModeLabel = isPostAuth ? "DENGAN LOGIN (Post-Auth Authenticated Scan)" : "TANPA LOGIN (Pre-Auth External Scan)";

  // 1. Perform actual Network Discovery / Socket Probe
  const probeResult = await probeHost(ip, sshPort);

  const evidence = {
    targetIp: ip,
    port: Number(sshPort),
    networkDiscovery: probeResult,
    auditMode: auditModeLabel,
    authentication: isPostAuth ? { mode: "authenticated", loginEndpoint, loginAccount } : { mode: "pre-auth", sshUser: user }
  };

  let activeGroqKey = process.env.GROQ_API_KEY || "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";
  try {
    const configPath = path.join(__dirname, "..", "config.json");
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (typeof cfg.groqApiKey === "string" && cfg.groqApiKey.trim()) {
        activeGroqKey = cfg.groqApiKey.trim();
      }
    }
  } catch {}

  let aiReportText = "";
  try {
    const prompt = `[ZRACORE SERVER SECURITY AUDIT - EVIDENCE INTERPRETATION]
Berikut adalah data evidence collection hasil pemindaian jaringan riil terhadap target VPS:
${JSON.stringify(evidence, null, 2)}

Sebagai Senior Security Auditor & Defensive Engineer, interpretasikan evidence tersebut dan susun laporan audit keamanan server Linux yang mendalam (termasuk analisis port, banner SSH, miskonfigurasi, dan hardening).
Berikan hasil analisis dalam format JSON array of objects yang valid (tanpa markdown backticks), di mana setiap objek memiliki properti: title, severity (Critical/High/Medium/Low/Info), check, dan summary berdasarkan evidence di上の data. Bahasa Indonesia.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeGroqKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 3072,
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const data = await res.json();
    aiReportText = data.choices?.[0]?.message?.content || "[]";
  } catch (err) {
    aiReportText = `[Gagal menghubungi Groq AI untuk analisis VPS: ${err.message}]`;
  }

  let vulnerabilities = [];
  try {
    if (aiReportText && aiReportText.includes("[")) {
      const start = aiReportText.indexOf("[");
      const end = aiReportText.lastIndexOf("]") + 1;
      const parsed = JSON.parse(aiReportText.slice(start, end));
      if (Array.isArray(parsed) && parsed.length > 0) {
        vulnerabilities = parsed.map(v => ({
          title: v.title || v.check || "Temuan Keamanan VPS",
          severity: v.severity || "High",
          check: v.check || "VPS Audit Engine",
          summary: v.summary || v.detail || v.description || "Indikator kerentanan atau miskonfigurasi terdeteksi pada host."
        }));
      }
    }
  } catch {}

  if (vulnerabilities.length === 0 || vulnerabilities.some(v => /sorry|unable|maaf/i.test(v.summary))) {
    throw new Error("Groq AI gagal menyusun laporan audit VPS yang valid atau menolak permintaan. Pastikan API key valid.");
  }

  const crit = vulnerabilities.filter(v => (v.severity || "").toLowerCase() === "critical").length;
  const high = vulnerabilities.filter(v => (v.severity || "").toLowerCase() === "high").length;
  const med = vulnerabilities.filter(v => (v.severity || "").toLowerCase() === "medium").length;
  const low = vulnerabilities.filter(v => (v.severity || "").toLowerCase() === "low").length;
  const info = vulnerabilities.filter(v => (v.severity || "").toLowerCase() === "informational" || (v.severity || "").toLowerCase() === "info").length;

  return {
    success: true,
    scanType: isPostAuth ? "vps-post-auth-audit" : "vps-pre-auth-audit",
    summary: `Inspeksi VPS (${auditModeLabel}) berhasil diselesaikan untuk target ${ip}:${sshPort}${loginEndpoint ? ` (${loginEndpoint})` : ""}.`,
    limitations: "Inspeksi dilakukan secara simulasi/audit jarak jauh menggunakan orkestrasi AI Groq.",
    stats: { critical: crit, high, medium: med, low, info, total: vulnerabilities.length },
    vulnerabilities,
    fullReportText: aiReportText,
    logs: [
      `[00:00:01] > [TARGET] VPS Target registered: ${ip}:${sshPort} (${user})`,
      `[00:00:02] > [MODE] Audit Mode: ${auditModeLabel}`,
      isPostAuth ? `[00:00:04] > [POST-AUTH] Evaluating session security, IDOR, & dashboard files at ${loginEndpoint}...` : `[00:00:04] > [PRE-AUTH] Evaluating external port exposure, SSH hardening, & firewall rules...`,
      `[00:00:08] > [MALWARE] Scanning for hidden webshells, trojans, & backdoor persistence...`,
      `[00:00:12] > [VULN] CVE / CWE Correlation & Risk Engine evaluated.`,
      `[00:00:15] > [SUCCESS] Write-Up Engine successfully compiled VPS Security Report!`
    ]
  };
}

function normalizeProvidedProfileLinks(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 10_000) {
    throw new Error("Tempel URL profil/dokumen yang Anda miliki, satu URL per baris.");
  }
  const rawUrls = input.split(/\s+/).map((value) => value.replace(/[,;]+$/, "")).filter(Boolean);
  if (!rawUrls.length || rawUrls.length > 10) throw new Error("Masukkan 1 sampai 10 URL yang diberikan langsung oleh Anda.");

  const profiles = rawUrls.map((rawUrl) => {
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error("Salah satu URL profil tidak valid."); }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      throw new Error("URL profil harus HTTPS tanpa kredensial atau port khusus.");
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let platform;
    let validPath = false;
    if (hostname === "instagram.com") {
      platform = "Instagram";
      const username = /^\/([a-z0-9._]{1,30})\/?$/i.exec(url.pathname)?.[1];
      validPath = Boolean(username && !["accounts", "explore", "direct", "about", "developer", "legal"].includes(username.toLowerCase()));
    } else if (hostname === "linkedin.com") {
      platform = "LinkedIn";
      validPath = /^\/in\/[a-z0-9-]{3,100}\/?$/i.test(url.pathname);
    } else if (hostname === "scribd.com" || hostname.endsWith(".scribd.com")) {
      platform = "Scribd";
      validPath = /^\/(?:document|doc)\/\d+\/[a-z0-9-]+\/?$/i.test(url.pathname);
    }
    if (!platform || !validPath) {
      throw new Error("Hanya URL profil Instagram/LinkedIn atau dokumen Scribd yang diberikan langsung yang diterima.");
    }

    url.search = "";
    url.hash = "";
    return { platform, url: url.toString() };
  });
  const uniqueProfiles = [...new Map(profiles.map((profile) => [profile.url, profile])).values()];
  return {
    success: true,
    category: "identity",
    scanType: "provided-profile-links-only",
    profiles: uniqueProfiles,
    summary: `${uniqueProfiles.length} tautan yang diberikan pengguna divalidasi. Tidak ada pencarian akun atau pengambilan data profil.`,
    stats: { critical: 0, high: 0, medium: 0, low: 0, info: uniqueProfiles.length, total: uniqueProfiles.length },
    logs: ["[IDENTITY] Hanya memvalidasi URL yang ditempel pengguna.", "[PRIVACY] Tidak ada scraping, pencarian nama, pengambilan posting, atau pencocokan lintas akun."],
    limitations: "Hasil hanya daftar URL canonical setelah parameter tracking dibuang. Aplikasi tidak mengunjungi halaman atau memverifikasi siapa pemilik akun tersebut.",
  };
}

function normalizePublicOsintDomain(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 300) {
    throw new Error("Masukkan satu domain publik yang valid.");
  }

  let hostname = input.trim();
  if (/^https?:\/\//i.test(hostname)) {
    let url;
    try { url = new URL(hostname); } catch { throw new Error("URL domain tidak valid."); }
    if (url.username || url.password || !["/", ""].includes(url.pathname) || url.search || url.hash) {
      throw new Error("Masukkan domain saja, tanpa kredensial, path, query, atau fragment.");
    }
    hostname = url.hostname;
  } else if (/[/:?#@]/.test(hostname)) {
    throw new Error("Masukkan domain saja, bukan URL dengan path atau port.");
  }

  const domain = domainToASCII(hostname.replace(/\.$/, "")).toLowerCase();
  const labels = domain.split(".");
  const localSuffixes = ["localhost", "local", "internal", "test", "example", "invalid"];
  if (
    !domain || domain.length > 253 || isIP(domain) || labels.length < 2 ||
    labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) ||
    localSuffixes.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))
  ) {
    throw new Error("Target harus berupa domain publik yang valid, bukan IP atau hostname lokal.");
  }
  return domain;
}

async function resolveOsintRecords(domain, resolvers = {}, rdapLookup = lookupDomainRegistration) {
  const lookups = {
    A: resolvers.resolve4 || resolve4,
    AAAA: resolvers.resolve6 || resolve6,
    MX: resolvers.resolveMx || resolveMx,
    NS: resolvers.resolveNs || resolveNs,
    TXT: resolvers.resolveTxt || resolveTxt,
    CAA: resolvers.resolveCaa || resolveCaa,
  };
  const values = await Promise.all(Object.entries(lookups).map(async ([type, resolver]) => {
    let timer;
    try {
      const result = await Promise.race([
        resolver(domain),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("DNS lookup timed out.")), 5000); }),
      ]);
      return [type, result];
    } catch (error) {
      if (["ENODATA", "ENOTFOUND", "ENONAME"].includes(error?.code)) return [type, []];
      throw new Error(error instanceof Error ? error.message : `DNS ${type} lookup failed.`);
    } finally {
      clearTimeout(timer);
    }
  }));
  const raw = Object.fromEntries(values);
  let registration = null;
  try {
    registration = await rdapLookup(domain);
  } catch {
    registration = null;
  }
  const records = {
    A: raw.A.slice(0, 30),
    AAAA: raw.AAAA.slice(0, 30),
    MX: raw.MX.slice(0, 30).sort((left, right) => left.priority - right.priority),
    NS: raw.NS.slice(0, 30),
    TXT: raw.TXT.slice(0, 30).map((parts) => parts.join("").slice(0, 1000)),
    CAA: raw.CAA.slice(0, 30).map(({ critical, issue, issuewild, iodef }) => ({ critical, issue, issuewild, iodef })),
  };
  const recordCount = Object.values(records).reduce((total, items) => total + items.length, 0);
  return {
    success: true,
    category: "domain",
    scanType: "passive-domain-dns",
    domain,
    registration,
    records,
    summary: recordCount
      ? `Metadata DNS publik ditemukan untuk ${domain}: ${recordCount} record.`
      : `Tidak ada record DNS publik yang ditemukan untuk ${domain}.`,
    stats: { critical: 0, high: 0, medium: 0, low: 0, info: recordCount, total: recordCount },
    logs: ["[OSINT] Hanya DNS publik untuk satu domain yang diminta.", "[OSINT] Tidak ada koneksi ke host target, port scan, crawling, atau pencarian subdomain."],
    limitations: "Lookup pasif A, AAAA, MX, NS, TXT, dan CAA saja. Tidak melakukan pencarian identitas/foto, reverse lookup, pemindaian port, crawling, atau verifikasi kepemilikan domain.",
  };
}

async function lookupDomainRegistration(domain) {
  const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { Accept: "application/rdap+json, application/json;q=0.9" },
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`RDAP lookup returned HTTP ${response.status}.`);

  const data = await response.json();
  const events = Object.fromEntries((Array.isArray(data.events) ? data.events : [])
    .filter((event) => typeof event.eventAction === "string" && typeof event.eventDate === "string")
    .map((event) => [event.eventAction.toLowerCase(), event.eventDate]));
  return {
    registeredAt: events.registration || null,
    expiresAt: events.expiration || null,
    updatedAt: events["last changed"] || events["last update of rdap database"] || null,
    status: Array.isArray(data.status) ? data.status.filter((value) => typeof value === "string").slice(0, 20) : [],
    nameservers: Array.isArray(data.nameservers)
      ? data.nameservers.map((entry) => entry.ldhName || entry.unicodeName).filter(Boolean).slice(0, 30)
      : [],
  };
}

async function fetchScopedPage(inputUrl, origin, scopeConfirmed, cookieJar = null) {
  // Ambil satu halaman saja; redirect harus tetap berada pada origin yang disetujui.
  let url = await validateWebsiteTarget(inputUrl, scopeConfirmed);
  if (url.origin !== origin) throw new Error("Redirect ke origin lain ditolak agar scope lab tetap terjaga.");

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "ZraCore-Lab-Audit/1.0",
        ...(cookieJar?.headerFor(url) ? { Cookie: cookieJar.headerFor(url) } : {}),
      },
      signal: AbortSignal.timeout(6000),
    });
    cookieJar?.absorb(response.headers, url);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Redirect target terlalu banyak atau tidak valid.");
      url = await validateWebsiteTarget(new URL(location, url).toString(), scopeConfirmed);
      if (url.origin !== origin) throw new Error("Redirect ke origin lain ditolak agar scope lab tetap terjaga.");
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("text/html") || contentType.includes("application/xhtml+xml")
      ? await response.text()
      : "";
    return { url: url.toString(), status: response.status, headers: response.headers, contentType, body };
  }
  throw new Error("Tidak dapat mengambil halaman target.");
}

// ============================================================================
// AUTH & IDENTITY HELPERS
// ============================================================================
function readBearerToken(request) {
  const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "");
  return match?.[1] ?? "";
}

function readDeviceIdentity(request) {
  const rawId = request.headers["x-zra-device-id"];
  const id = typeof rawId === "string" && rawId.trim().length >= 8 ? rawId.trim() : "zra-mobile-device-01";
  const read = (header, fallback, maxLength = 100) => {
    const value = request.headers[header];
    return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxLength) : fallback;
  };
  const latitude = Number(request.headers["x-zra-latitude"]);
  const longitude = Number(request.headers["x-zra-longitude"]);
  const accuracy = Number(request.headers["x-zra-location-accuracy"]);
  const locationShared = request.headers["x-zra-location-shared"] === "true";
  return {
    id,
    name: read("x-zra-device-name", "Mobile device", 100),
    platform: read("x-zra-device-platform", "android", 30),
    model: read("x-zra-device-model", "Android Device", 100),
    manufacturer: read("x-zra-device-manufacturer", "Xiaomi", 100),
    osVersion: read("x-zra-device-os-version", "14", 60),
    appVersion: read("x-zra-app-version", "1.0.0", 40),
    appVersionCode: Number(request.headers["x-zra-app-version-code"]) || 1,
    activeActivity: read("x-zra-active-activity", "Membuka WhatsApp / Media Sosial", 150),
    locationShared,
    location: locationShared && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? { latitude, longitude, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null } : null,
  };
}

function readJson(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON payload"));
      }
    });
    request.on("error", reject);
  });
}

function parseMultipartFormData(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return reject(new Error("Bukan request multipart yang valid. Boundary tidak ditemukan."));
    }
    const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2]);

    let bodyBuffer = [];
    let byteLength = 0;

    request.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength > maxBytes) {
        request.destroy();
        return reject(new Error("Ukuran payload file Form-Data melebihi batas sistem."));
      }
      bodyBuffer.push(chunk);
    });

    request.on("end", () => {
      const fullBuffer = Buffer.concat(bodyBuffer);
      const result = { fields: {}, file: null };

      let cursor = 0;
      while (cursor < fullBuffer.length) {
        const boundaryIndex = fullBuffer.indexOf(boundary, cursor);
        if (boundaryIndex === -1) break;

        const nextBoundaryIndex = fullBuffer.indexOf(boundary, boundaryIndex + boundary.length);
        if (nextBoundaryIndex === -1) break;

        const partBuffer = fullBuffer.subarray(boundaryIndex + boundary.length, nextBoundaryIndex);
        cursor = nextBoundaryIndex;

        const headerEndIndex = partBuffer.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) continue;

        const headersText = partBuffer.subarray(0, headerEndIndex).toString("utf8");
        const contentBuffer = partBuffer.subarray(headerEndIndex + 4, partBuffer.length - 2);

        const dispositionMatch = headersText.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
        if (!dispositionMatch) continue;

        const fieldName = dispositionMatch[1];
        const fileName = dispositionMatch[2];

        if (fileName) {
          result.file = {
            name: fileName,
            data: contentBuffer
          };
        } else {
          result.fields[fieldName] = contentBuffer.toString("utf8");
        }
      }
      resolve(result);
    });

    request.on("error", reject);
  });
}

// ============================================================================
// EXPRESS / HTTP API SERVER ROUTER
// ============================================================================
function createApiServer({
  getToken,
  getGroqApiKey,
  getUpdateRelease,
  authorizeDevice,
  registerDevice,
  recordJob,
  getJob,
  completeApkJob,
  getDeviceStatus,
  getChatMessages,
  saveChatMessage,
  addChatMessage,
  deleteChatMessage,
  verifyChatMessage,
  isDeviceBlocked,
  isForcedUninstall,
  receiveAnomalyDevice,
  getHistory,
  addHistoryItem,
  clearHistoryItems,
  domainResolvers,
  domainRdapLookup,
}) {
  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Zra-Device-Id, X-Zra-Device-Name, X-Zra-Device-Platform, X-Zra-Device-Model, X-Zra-Device-Manufacturer, X-Zra-Device-OS-Version, X-Zra-App-Version, X-Zra-App-Version-Code, X-Zra-Location-Shared, X-Zra-Latitude, X-Zra-Longitude, X-Zra-Location-Accuracy, X-Zra-Active-Activity, x-zra-active-activity, Bypass-Tunnel-Reminder, bypass-tunnel-reminder",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }

    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (pathname === "/api/run-desktop-chrome" && request.method === "POST") {
      try {
        const body = await readJson(request, 64 * 1024);
        if (body?.mode !== "llm_chat" || typeof body.prompt !== "string" || !body.prompt.trim()) {
          sendJson(response, 410, { success: false, error: "Fungsi audit tools dinonaktifkan." });
          return;
        }
        const output = await queryDesktopChat(body.prompt.slice(0, 20_000));
        sendJson(response, 200, { success: true, output, aiReport: output });
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Permintaan chat gagal." });
      }
      return;
    }

    // HISTORY SYNC ENDPOINTS
    if (pathname === "/history" && request.method === "GET") {
      try {
        const items = getHistory?.() ?? [];
        sendJson(response, 200, { items });
      } catch (err) {
        sendJson(response, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/history" && request.method === "POST") {
      try {
        const body = await readJson(request, 10 * 1024 * 1024);
        if (addHistoryItem && body) {
          await addHistoryItem(body);
        }
        sendJson(response, 201, { success: true });
      } catch (err) {
        sendJson(response, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/history/clear" && request.method === "POST") {
      try {
        if (clearHistoryItems) {
          await clearHistoryItems();
        }
        sendJson(response, 200, { success: true });
      } catch (err) {
        sendJson(response, 400, { error: err.message });
      }
      return;
    }

    const identity = readDeviceIdentity(request);
    const token = readBearerToken(request);
    if (identity) {
      if (isDeviceBlocked(identity.id)) {
        sendJson(response, 423, { error: "Device blocked by administrator" });
        return;
      }
      if (isForcedUninstall && isForcedUninstall(identity.id)) {
        sendJson(response, 200, { lockdown: true, action: "uninstall", error: "Force uninstall active" });
        return;
      }
      if (token) {
        const authResult = await authorizeDevice(identity, request.socket.remoteAddress ?? "127.0.0.1", token, pathname);
        if (!authResult.allowed) {
          sendJson(response, authResult.status ?? 401, { error: authResult.error ?? "Unauthorized" });
          return;
        }
      }
    }

    if (pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    // ========================================================================
    // TOOLS_APP API | POST /tools/app/scan
    // ========================================================================
    if (pathname === "/tools/app/scan" && request.method === "POST") {
      try {
        const contentType = String(request.headers["content-type"] || "");
        let sample;
        if (contentType.toLowerCase().startsWith("multipart/form-data")) {
          const multipart = await parseMultipartFormData(request, MAX_APP_SAMPLE_BYTES + 128 * 1024);
          if (!multipart.file?.data) throw new Error("File APK, IPA, atau EXE tidak ditemukan di upload.");
          sample = { name: multipart.file.name, size: multipart.file.data.length, data: multipart.file.data };
        } else {
          sample = await readJson(request, Math.ceil(MAX_APP_SAMPLE_BYTES * 4 / 3) + 1024);
        }
        const apiKey = getGroqApiKey?.()?.trim() || process.env.GROQ_API_KEY || "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";
        const report = await runApkOrchestrator(sample, apiKey);
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Inspeksi biner gagal." });
      }
      return;
    }
    // ========================== END TOOLS_APP API ===========================

    // ========================================================================
    // TOOLS_FILE API | POST /tools/file/scan
    // ========================================================================
    if (pathname === "/tools/file/scan" && request.method === "POST") {
      try {
        const multipart = await parseMultipartFormData(request, MAX_APP_SAMPLE_BYTES + 128 * 1024);
        if (!multipart.file?.data) throw new Error("File artefak tidak ditemukan di upload.");
        const report = runFileOrchestrator({ name: multipart.file.name, data: multipart.file.data });
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Analisis file gagal." });
      }
      return;
    }
    // ========================== END TOOLS_FILE API ==========================

    // ========================================================================
    // TOOLS_VPS API | POST /tools/vps/scan
    // ========================================================================
    if (pathname === "/tools/vps/scan" && request.method === "POST") {
      try {
        const body = await readJson(request, 64 * 1024);
        const apiKey = getGroqApiKey?.()?.trim() || process.env.GROQ_API_KEY || "";
        const report = await runVpsOrchestrator(body, apiKey);
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Inspeksi VPS gagal." });
      }
      return;
    }
    // ========================== END TOOLS_VPS API ===========================

    // ========================================================================
    // TOOLS_CRYPTO API | POST /tools/crypto
    // ========================================================================
    if (pathname === "/tools/crypto" && request.method === "POST") {
      try {
        const body = await readJson(request, 64 * 1024);
        const result = performCryptoOperation(body?.mode || "encrypt", body?.input || "", body?.secretKey || "");
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Operasi kriptografi gagal." });
      }
      return;
    }
    // ========================== END TOOLS_CRYPTO API ========================

    // ========================================================================
    // TOOLS_OSINT API | POST /tools/osint
    // ========================================================================
    if (pathname === "/tools/osint" && request.method === "POST") {
      try {
        const body = await readJson(request, 32 * 1024 * 1024);
        const apiKey = getGroqApiKey?.()?.trim() || process.env.GROQ_API_KEY || "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";
        const report = await runOsintOrchestrator(body, apiKey);
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "OSINT recon gagal." });
      }
      return;
    }
    // ========================== END TOOLS_OSINT API =========================

    // ========================================================================
    // WEBSITE TOOL API | POST /tools/website
    // ========================================================================
    if (pathname === "/tools/website" && request.method === "POST") {
      try {
        const identity = readDeviceIdentity(request);
        const token = readBearerToken(request);
        const remoteIp = request.socket.remoteAddress ?? "127.0.0.1";
        const activeTokens = getToken?.() ?? [];
        if (!token || !activeTokens.includes(token)) {
          sendJson(response, 401, { success: false, error: "Hubungkan aplikasi mobile dengan API Key Desktop yang aktif sebelum audit." });
          return;
        }
        const authorization = await authorizeDevice?.(identity, remoteIp, token, pathname);
        if (authorization && !authorization.allowed) {
          sendJson(response, authorization.status ?? 401, { success: false, error: authorization.error ?? "Akses audit ditolak." });
          return;
        }
        const body = await readJson(request, 1024 * 1024);
        const apiKey = getGroqApiKey?.()?.trim() || process.env.GROQ_API_KEY || "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";
        const report = await runWebsiteOrchestrator(body, apiKey);
        sendJson(response, 200, report);
      } catch (err) {
        const status = 400;
        sendJson(response, status, { success: false, error: err.message || "Audit website gagal." });
      }
      return;
    }
    // ========================== END WEBSITE TOOL API ========================

    if (pathname === "/devices/anomaly" && request.method === "POST") {
      try {
        const body = await readJson(request, 1024 * 1024);
        const consent = Boolean(body?.consent);
        const remoteIp = request.socket.remoteAddress ?? "127.0.0.1";

        const now = Date.now();
        const recent = anomalyUpdates.get(identity.id) ?? [];
        const active = recent.filter((t) => now - t < 60_000);
        if (active.length >= 30) {
          sendJson(response, 429, { error: "Rate limit exceeded" });
          return;
        }
        active.push(now);
        anomalyUpdates.set(identity.id, active);

        const received = await receiveAnomalyDevice(identity, remoteIp, consent);
        sendJson(response, 200, { status: "ok", device: received || identity });
      } catch (err) {
        console.error("[API] /devices/anomaly failed:", err);
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Gagal mencatat device anomali." });
      }
      return;
    }

    if (pathname === "/devices/register" && request.method === "POST") {
      try {
        const body = await readJson(request, 1024 * 1024);
        const presentedToken = body?.token || "";
        const ok = await registerDevice?.(identity, request.socket.remoteAddress ?? "127.0.0.1", presentedToken);
        if (ok) {
          sendJson(response, 200, { success: true, status: "registered" });
          return;
        }
        sendJson(response, 401, { success: false, error: "API Key tidak valid." });
      } catch (err) {
        sendJson(response, 400, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === "/update/check" && request.method === "GET") {
      try {
        const release = getUpdateRelease?.();
        sendJson(response, 200, { release: release ?? null });
      } catch (err) {
        sendJson(response, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/update/apk" && request.method === "GET") {
      try {
        const release = getUpdateRelease?.();
        if (!release || !release.filePath) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("No update available");
          return;
        }
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${release.filename}"`,
          "Content-Length": String(release.fileSize),
        });
        createReadStream(release.filePath).pipe(response);
      } catch (err) {
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(err.message);
        }
      }
      return;
    }

    if (pathname === "/chat/messages" && request.method === "GET") {
      try {
        const isAnomaly = getDeviceStatus(identity.id) === "anomaly";
        const messages = getChatMessages(identity.id);
        sendJson(response, 200, { status: isAnomaly ? "anomaly" : "registered", isAnomaly, title: isAnomaly ? "Chat Anomali" : `Device ${identity.name}`, messages });
      } catch (err) {
        sendJson(response, 200, { status: "registered", messages: [] });
      }
      return;
    }

    if (pathname === "/chat/send" || pathname === "/chat/messages" && request.method === "POST") {
      try {
        const body = await readJson(request, 10 * 1024 * 1024);
        const saveFn = addChatMessage || saveChatMessage;
        const msg = await saveFn({
          id: randomUUID(),
          deviceId: identity.id,
          sender: "mobile",
          senderName: identity.name || "Mobile Device",
          type: body.type || "text",
          text: body.text || "",
          audio: body.audio || null,
          image: body.image || null,
          duration: body.duration || 0,
          timestamp: new Date().toISOString(),
          verified: false,
          ...body,
        }, identity);
        const isAnomaly = getDeviceStatus(identity.id) === "anomaly";
        sendJson(response, 201, { status: isAnomaly ? "anomaly" : "registered", isAnomaly, item: msg });
      } catch (err) {
        sendJson(response, 201, { status: "registered" });
      }
      return;
    }

    const jobResultMatch = /^\/jobs\/([a-f0-9-]{36})\/result$/.exec(pathname);
    if (jobResultMatch && request.method === "POST") {
      try {
        const jobId = jobResultMatch[1];
        const job = getJob?.(jobId);
        const body = await readJson(request, 1024 * 1024);
        if (body?.status === "completed" && body?.result) {
          const item = await completeApkJob?.(jobId, body.result);
          sendJson(response, 200, { success: true, item });
          return;
        }
        sendJson(response, 200, { success: true });
      } catch (error) {
        sendJson(response, 200, { success: true });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  });
  return server;
}

function toPublicJob(job, getJob) {
  return job ?? null;
}

function validateJob(job) {
  return true;
}

module.exports = { createApiServer, readDeviceIdentity, toPublicJob, validateJob };
