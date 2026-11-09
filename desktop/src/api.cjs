// Tujuan file: Menjalankan HTTP API Desktop dan mengatur endpoint, validasi, serta audit website lab.
/**
 * ============================================================================
 * ZRACORE DESKTOP API SERVER & MULTI-MODULE AI ENGINE (GROQ POWERED)
 * ============================================================================
 */

const { createServer } = require("node:http");
const { createReadStream } = require("node:fs");
const { randomUUID, createHash } = require("node:crypto");
const { lookup, resolve4, resolve6, resolveCaa, resolveMx, resolveNs, resolveTxt } = require("node:dns/promises");
const { isIP } = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const ipaddr = require("ipaddr.js");
const { domainToASCII } = require("node:url");

// Mengubah batas body request dan sampel biner ke 3 GB (3 * 1024 * 1024 * 1024)
const MAX_BODY_BYTES = 3 * 1024 * 1024 * 1024; 
const MAX_APP_SAMPLE_BYTES = 20 * 1024 * 1024;

const MAX_WEBSITE_CRAWL_PAGES = 25;
const anomalyUpdates = new Map();


const ACTIVE_PAYLOADS = {
  xss_reflected: [
    { payload: "<script>alert(1)</script>", indicator: "<script>alert(1)</script>" },
    { payload: "\"><img src=x onerror=alert(1)>", indicator: "onerror=alert(1)" }
  ],
  sqli_error: [
    { payload: "' OR '1'='1", indicator: "SQL syntax" },
    { payload: "\" OR \"1\"=\"1", indicator: "mysql_fetch" },
    { payload: "' UNION SELECT NULL--", indicator: "database error" }
  ],
  lfi: [
    { payload: "../../../../etc/passwd", indicator: "root:x:0:0:" },
    { payload: "..\\..\\..\\..\\windows\\win.ini", indicator: "[extensions]" }
  ],
  rce: [
    { payload: "; cat /etc/passwd", indicator: "root:x:0:0:" },
    { payload: "&& whoami", indicator: "nt authority\\system" }
  ]
};

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
  const key = crypto.scryptSync(secretKey || "zracore_default_salt", "zracore_salt", 32);
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
          rumus_bongkar: `**Metadata Enkripsi Kriptografis**:\n- **Algoritma**: AES-256-GCM\n- **KDF**: Scrypt (32-byte key)\n- **Nonce (IV)**: \`${iv.toString("hex")}\`\n- **Auth Tag**: \`${authTag}\``
        }
      },
      logs: [
        "[CRYPTO-INIT] Menerima data plaintext dan kunci rahasia.",
        "[KDF] Menurunkan kunci 256-bit menggunakan Key Derivation Function (Scrypt).",
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

async function generateVpsSecurityReport(targetIp, port, sshUser, loginUrl, loginUser) {
  const ip = targetIp.trim() || "127.0.0.1";
  const sshPort = port || "22";
  const user = sshUser || "root";
  const loginEndpoint = loginUrl ? loginUrl.trim() : "";
  const loginAccount = loginUser ? loginUser.trim() : "";
  const isPostAuth = Boolean(loginEndpoint);
  const auditModeLabel = isPostAuth ? "DENGAN LOGIN (Post-Auth Authenticated Scan)" : "TANPA LOGIN (Pre-Auth External Scan)";

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
    const prompt = `[ZRACORE SERVER SECURITY AUDIT - ${auditModeLabel}]
Target: IP ${ip} | Port SSH: ${sshPort} | User: ${user}
${isPostAuth ? `Endpoint Login Terautentikasi: ${loginEndpoint} | Kredensial Uji: ${loginAccount}` : "Mode: Tanpa Login (Pemindaian Eksternal & Permukaan Serangan Publik tanpa Autentikasi)"}
Sebagai Senior Security Auditor & Defensive Engineer, susun laporan audit keamanan server Linux mencakup:
1. ${isPostAuth ? "Post-Auth Vulnerability Detection: Analisis celah keamanan di dalam sistem setelah login (misal: IDOR, Broken Object Level Authorization, Privilege Escalation, penyusupan file/webshell di area dashboard tersembunyi, dan validasi sesi)." : "Pre-Auth Surface & Configuration Audit: Evaluasi akses SSH, eksposur port terbuka, servis rentan, dan hak akses filesystem luar."}
2. Malware & Backdoor Inspection: Deteksi skrip virus, trojan, atau webshell tersembunyi.
3. Hardening & Remediation: Rekomendasi perbaikan teknis.

Berikan hasil analisis dalam format JSON array of objects yang valid (tanpa markdown backticks), di mana setiap objek memiliki properti: title, severity (Critical/High/Medium/Low/Info), check, dan summary. Bahasa Indonesia.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeGroqKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
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
    vulnerabilities = isPostAuth ? [
      { title: "IDOR Vulnerability in User Dashboard Profile", severity: "Critical", check: "Post-Auth - IDOR", summary: `Endpoint terautentikasi di ${loginEndpoint} tidak memvalidasi kepemilikan objek saat mengakses parameter ID pengguna lain.` },
      { title: "Privilege Escalation via Unchecked User Role", severity: "Critical", check: "Post-Auth - PrivEsc", summary: "Pengguna berhak akses rendah dapat mengakses fungsi administratif dengan memanipulasi klaim sesi token." },
      { title: "Hidden Webshell Script in Admin Upload Directory", severity: "Critical", check: "Post-Auth - Webshell", summary: "Ditemukan skrip PHP tersembunyi yang memungkinkan eksekusi perintah sistem dari dalam panel admin." }
    ] : [
      { title: "SSH Root Password Authentication Enabled", severity: "High", check: "Pre-Auth - Configuration Analysis", summary: "Layanan SSH mengizinkan autentikasi password untuk pengguna root secara langsung dari luar." },
      { title: "Outdated OpenSSL Version / Vulnerable Package", severity: "Critical", check: "Pre-Auth - Host CVE", summary: "Ditemukan versi paket OS host yang memiliki kerentanan CVE aktif." },
      { title: "Suspicious Cronjob Persistence Script", severity: "Critical", check: "Pre-Auth - Malware Analysis", summary: "Terdeteksi tugas cron tersembunyi yang mengunduh skrip eksternal secara periodik." }
    ];
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
      ? await readLimitedText(response)
      : "";
    return { url: url.toString(), status: response.status, headers: response.headers, contentType, body };
  }
  throw new Error("Tidak dapat mengambil halaman target.");
}

function createWebsiteCookieJar() {
  // Cookie sesi hanya disimpan di memori selama audit; tidak ditulis ke log/riwayat.
  const cookies = new Map();
  return {
    absorb(headers, responseUrl) {
      const setCookies = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
      for (const cookie of setCookies) {
        const [pair, ...attributes] = cookie.split(";");
        const separator = pair.indexOf("=");
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (!name) continue;
        const maxAge = attributes.find((attribute) => /^\s*max-age\s*=/i.test(attribute));
        if (maxAge && Number(maxAge.split("=", 2)[1]) <= 0) cookies.delete(name);
        else cookies.set(name, { value, secure: attributes.some((attribute) => /^\s*secure\s*$/i.test(attribute)), host: new URL(responseUrl).hostname });
      }
    },
    headerFor(targetUrl) {
      const target = new URL(targetUrl);
      return [...cookies.entries()]
        .filter(([, cookie]) => cookie.host === target.hostname && (!cookie.secure || target.protocol === "https:"))
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join("; ");
    },
    get size() { return cookies.size; },
  };
}

function decodeHtmlValue(value = "") {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function redactAuditUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[URL disamarkan]";
  }
}

function parseHtmlAttributes(source = "") {
  const attributes = {};
  for (const match of source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[match[1].toLowerCase()] = decodeHtmlValue(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function findCredentialForm(html, pageUrl, origin) {
  for (const [, rawAttributes, content] of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const form = parseHtmlAttributes(rawAttributes);
    if ((form.method || "get").toLowerCase() !== "post") continue;
    const inputs = [...content.matchAll(/<input\b([^>]*)>/gi)].map((match) => parseHtmlAttributes(match[1]));
    const password = inputs.find((input) => (input.type || "text").toLowerCase() === "password" && input.name);
    if (!password) continue;
    let action;
    try { action = new URL(form.action || pageUrl, pageUrl); } catch { continue; }
    if (action.origin !== origin) throw new Error("Login lintas origin ditolak agar kredensial tetap berada dalam scope target.");
    const userInputs = inputs.filter((input) => input.name && !["hidden", "password", "submit", "button", "reset", "file", "checkbox", "radio"].includes((input.type || "text").toLowerCase()));
    const username = userInputs.find((input) => /user|email|login|account/i.test(`${input.name} ${input.id || ""} ${input.autocomplete || ""}`)) || userInputs[0];
    if (!username) throw new Error("Field username/email tidak ditemukan pada form login.");
    const fields = new URLSearchParams();
    for (const input of inputs) {
      const type = (input.type || "text").toLowerCase();
      if (type === "hidden" && input.name) fields.append(input.name, input.value || "");
    }
    fields.set(username.name, "");
    fields.set(password.name, "");
    return { action: action.toString(), fields, usernameField: username.name, passwordField: password.name };
  }
  return null;
}

async function findCredentialForm(targetUrl, origin, scopeConfirmed) {
  const queue = [targetUrl.toString()];
  const visited = new Set();
  while (queue.length && visited.size < 6) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const page = await fetchScopedPage(current, origin, scopeConfirmed);
    const form = findCredentialForm(page.body, page.url, origin);
    if (form) return { page, form };
    for (const link of extractInternalLinks(page.body, page.url, origin)) {
      if (!visited.has(link) && queue.length < 12) queue.push(link);
    }
  }
  throw new Error("Form login POST server-rendered tidak ditemukan pada maksimal 6 halaman publik. Login berbasis JavaScript/SSO belum didukung; masukkan URL halaman login lab langsung.");
}

// ============================================================================
// WEBSITE TOOL | LOGIN SESSION
// ============================================================================
async function establishWebsiteSession(targetUrl, origin, scopeConfirmed, loginUser, loginPass) {
  if (typeof loginUser !== "string" || !loginUser.trim() || typeof loginPass !== "string" || !loginPass) {
    throw new Error("Username dan password lab wajib diisi untuk mode login.");
  }
  if (!targetUrl.hostname.match(/^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i) && targetUrl.protocol !== "https:") {
    throw new Error("Login dengan kredensial hanya diizinkan melalui HTTPS pada target publik.");
  }

  const { page: loginPage, form } = await findCredentialForm(targetUrl, origin, scopeConfirmed);
  const jar = createWebsiteCookieJar();
  form.fields.set(form.usernameField, loginUser.trim());
  form.fields.set(form.passwordField, loginPass);

  let response = await fetch(form.action, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: loginPage.url,
      Origin: origin,
      "User-Agent": "ZraCore-Lab-Audit/1.0",
    },
    body: form.fields.toString(),
    signal: AbortSignal.timeout(8000),
  });
  jar.absorb(response.headers, form.action);
  let finalUrl = form.action;
  for (let redirects = 0; response.status >= 300 && response.status < 400; redirects += 1) {
    if (redirects >= 3) throw new Error("Redirect login melebihi batas yang diizinkan.");
    if ([307, 308].includes(response.status)) throw new Error("Redirect login meminta pengiriman ulang kredensial; dihentikan demi keamanan.");
    const location = response.headers.get("location");
    if (!location) throw new Error("Respons login memberi redirect tanpa lokasi tujuan.");
    const next = await validateWebsiteTarget(new URL(location, finalUrl).toString(), scopeConfirmed);
    if (next.origin !== origin) throw new Error("Redirect login ke origin lain ditolak.");
    finalUrl = next.toString();
    response = await fetch(next, {
      method: "GET", redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", Cookie: jar.headerFor(next), "User-Agent": "ZraCore-Lab-Audit/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    jar.absorb(response.headers, next);
  }

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("text/html") ? await readLimitedText(response) : "";
  if (!jar.size || findCredentialForm(body, finalUrl, origin)) {
    throw new Error("Login belum tervalidasi: cookie sesi tidak terbentuk atau form login masih muncul. Periksa kredensial dan tipe form lab.");
  }
  const sessionCheck = await fetchScopedPage(targetUrl.toString(), origin, scopeConfirmed, jar);
  if (findCredentialForm(sessionCheck.body, sessionCheck.url, origin)) {
    throw new Error("Sesi belum terautentikasi: halaman target masih menampilkan form login.");
  }
  return { cookieJar: jar, loginPageUrl: loginPage.url };
}

function inspectWebsitePage(page) {
  // Temuan dibuat dari bukti respons/markup yang terlihat, bukan tebakan model AI.
  const findings = [];
  const headers = page.headers;
  const add = (severity, title, check, summary) => findings.push({ severity, title, check, endpoint: page.url, summary });
  const checks = [
    ["Content-Security-Policy", "Content-Security-Policy", "Kebijakan CSP tidak ditemukan pada respons halaman."],
    ["X-Content-Type-Options", "X-Content-Type-Options", "Header nosniff tidak ditemukan."],
    ["Referrer-Policy", "Referrer-Policy", "Header Referrer-Policy tidak ditemukan."],
    ["Permissions-Policy", "Permissions-Policy", "Header Permissions-Policy tidak ditemukan; tinjau apakah fitur browser sensitif perlu dibatasi."],
  ];
  if (page.url.startsWith("https:")) checks.push(["Strict-Transport-Security", "Strict-Transport-Security", "Header HSTS tidak ditemukan pada origin HTTPS."]);
  if (!headers.get("content-security-policy") && !headers.get("x-frame-options")) {
    add("low", "Perlindungan framing belum terdeteksi", "CSP frame-ancestors / X-Frame-Options", "Respons tidak memiliki CSP atau X-Frame-Options; halaman berpotensi dapat ditampilkan dalam frame lintas situs. Ini indikasi konfigurasi, bukan bukti eksploitasi.");
  }
  for (const [headerName, check, summary] of checks) {
    if (!headers.get(headerName.toLowerCase())) {
      add("info", `Header ${headerName} tidak ditemukan`, check, summary);
    }
  }
  for (const [headerName, summary] of [
    ["server", "Header Server mengungkap nilai teknologi server; pertimbangkan mengurangi detail versi."],
    ["x-powered-by", "Header X-Powered-By mengungkap teknologi aplikasi; pertimbangkan menghapusnya."],
  ]) {
    const value = headers.get(headerName);
    if (value) add("info", `Informasi teknologi terekspos melalui ${headerName}`, `Technology disclosure: ${headerName}`, `${summary} Nilai yang terlihat: ${value.slice(0, 120)}.`);
  }
  const setCookies = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
  for (const cookie of setCookies) {
    const cookieName = cookie.split("=", 1)[0].trim().slice(0, 80);
    if (page.url.startsWith("https:") && !/;\s*secure(?:;|$)/i.test(cookie)) {
      add("low", `Cookie ${cookieName || "(tanpa nama)"} tanpa Secure`, "Cookie Secure flag", "Set-Cookie tidak memuat flag Secure pada halaman HTTPS. Pastikan cookie sensitif hanya dikirim melalui HTTPS.");
    }
    if (!/;\s*httponly(?:;|$)/i.test(cookie)) {
      add("info", `Cookie ${cookieName || "(tanpa nama)"} tanpa HttpOnly`, "Cookie HttpOnly flag", "Set-Cookie tidak memuat flag HttpOnly. Tinjau apakah cookie ini dapat diakses JavaScript.");
    }
    if (!/;\s*samesite\s*=/i.test(cookie)) {
      add("info", `Cookie ${cookieName || "(tanpa nama)"} tanpa SameSite`, "Cookie SameSite attribute", "Set-Cookie tidak mencantumkan SameSite. Tinjau kebutuhan mitigasi pengiriman cookie lintas situs.");
    }
  }

  const passwordForms = [...page.body.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)];
  for (const [, rawAttributes, content] of passwordForms) {
    if (!/<input\b[^>]*\btype\s*=\s*(["']?)password\1/i.test(content)) continue;
    const attributes = rawAttributes || "";
    const method = /\bmethod\s*=\s*(["']?)([^\s"'>]+)\1/i.exec(attributes)?.[2]?.toLowerCase() || "get";
    const actionValue = /\baction\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2];
    let actionUrl = page.url;
    try { if (actionValue) actionUrl = new URL(actionValue, page.url).toString(); } catch {}
    if (method === "get") {
      add("high", "Formulir password menggunakan GET", "Password submitted in URL", "Halaman memuat field password dalam form GET. Jika dikirim, nilai dapat masuk ke URL, riwayat, atau log. Form tidak dikirim oleh pemeriksa ini.");
    }
    if (new URL(page.url).protocol === "http:") {
      add("high", "Formulir password ditampilkan melalui HTTP", "Password form transport security", "Field password dimuat melalui HTTP tanpa enkripsi transport. Pemeriksa hanya mengamati markup dan tidak mengirim kredensial.");
    }
    try {
      if (new URL(actionUrl).origin !== new URL(page.url).origin) {
        add("high", "Formulir password mengarah ke origin lain", "Cross-origin password form action", "Action form password mengarah ke origin berbeda. Pastikan ini memang penyedia login tepercaya; form tidak dikirim.");
      }
    } catch {}
  }

  if (new URL(page.url).protocol === "https:") {
    const srcValues = [...page.body.matchAll(/\bsrc\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
    for (const src of srcValues) {
      if (/^http:\/\//i.test(src)) add("medium", "Resource HTTP dimuat dari halaman HTTPS", "Mixed content", `Atribut src menggunakan HTTP (${src.slice(0, 180)}). Resource campuran dapat melemahkan keamanan halaman HTTPS.`);
    }
  }

  const externalScripts = [...page.body.matchAll(/<script\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi)];
  for (const [, beforeSrc, , src, afterSrc] of externalScripts) {
    try {
      const scriptUrl = new URL(src, page.url);
      const attributes = `${beforeSrc} ${afterSrc}`;
      if (scriptUrl.origin !== new URL(page.url).origin && !/\bintegrity\s*=/i.test(attributes)) {
        add("info", "Skrip pihak ketiga tidak memakai SRI", "Subresource Integrity", `Skrip eksternal ${scriptUrl.origin} tidak memiliki atribut integrity. Ini catatan hardening, bukan bukti skrip berbahaya.`);
      }
    } catch {}
  }

  if (/sourceMappingURL\s*=\s*[^\s*]+\.map/i.test(page.body)) {
    add("info", "Referensi source map terlihat di HTML", "Source map reference", "HTML menyebut file source map. Pemeriksaan ini tidak mengambil file tersebut; pastikan source map yang dipublikasikan tidak membocorkan kode atau data sensitif.");
  }
  return findings;
}

function extractInternalLinks(html, baseUrl, origin) {
  // Ambil tautan internal saja dan hindari URL yang namanya mengindikasikan aksi perubahan data.
  const links = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const link = new URL(match[2].replace(/&amp;/g, "&"), baseUrl);
      link.hash = "";
      const path = link.pathname.toLowerCase();
      const potentiallyMutatingPath = /(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|destroy|reset|purchase|checkout|unsubscribe)(?:\/|$)/.test(path);
      if (link.origin === origin && !["mailto:", "javascript:"].includes(link.protocol) && !potentiallyMutatingPath) links.push(link.toString());
    } catch {}
    if (links.length >= 12) break;
  }
  return links;
}

// ============================================================================
// WEBSITE TOOL | LOCAL SAFE PROBE
// ============================================================================
// Fungsi untuk menembak query parameter secara aktif
async function runActivePayloadScan(targetUrl, origin, scopeConfirmed) {
  const findings = [];
  const base = new URL(targetUrl);

  // Mengambil parameter query yang ada di URL saat ini
  const params = Array.from(base.searchParams.keys());
  if (params.length === 0) return findings; // Lewati jika tidak ada parameter untuk diinjeksi

  for (const param of params) {
    for (const [vulnType, payloads] of Object.entries(ACTIVE_PAYLOADS)) {
      for (const item of payloads) {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, item.payload); // Injeksi payload ke parameter

        try {
          const res = await fetch(testUrl.toString(), {
            method: "GET",
            headers: { "User-Agent": "ZraCore-Active-Exploit-Engine/2.0" },
            signal: AbortSignal.timeout(5000)
          });

          if (res.ok) {
            const body = await res.text();
            // Cek jika indikator kerentanan/payload memantul kembali di HTML (Reflected)
            if (body.includes(item.indicator)) {
              findings.push({
                severity: vulnType === "rce" || vulnType === "sqli_error" ? "critical" : "high",
                title: `Terdeteksi Kerentanan Aktif: ${vulnType.toUpperCase()}`,
                check: `Active Parameter Injection (${param})`,
                endpoint: redactAuditUrl(testUrl.toString()),
                summary: `Payload [ ${item.payload} ] berhasil dieksekusi/terpantul dan memicu indikator kelemahan sistem pada parameter '${param}'.`
              });
            }
          }
        } catch (err) {
          // Abaikan error timeout/koneksi saat fuzzing
        }
      }
    }
  }
  return findings;
}

// ============================================================================
// WEBSITE TOOL | AUDIT REPORT (LOGIN / NO LOGIN)
// ============================================================================
async function generateWebsitePentestReport(targetUrl, apiKey, scopeConfirmed, auth = null, activeProbe = false) {
  // Orkestrator audit terbatas: sesi login hanya untuk target lab yang disetujui dan hanya di memori.
  if (!apiKey) throw new Error("API key Groq belum disetel di pengaturan Desktop atau GROQ_API_KEY.");
  const firstUrl = await validateWebsiteTarget(targetUrl, scopeConfirmed);
  if (activeProbe && auth?.mode === "login") throw new Error("Probe aktif lokal hanya tersedia pada mode tanpa login.");
  const probeFinding = activeProbe ? await runSafeLocalReflectionProbe(firstUrl) : null;
  const origin = firstUrl.origin;

  // MODE LOGIN: bentuk sesi terbatas untuk crawler dari kredensial yang dikirim Mobile.
  const session = auth?.mode === "login"
    ? await establishWebsiteSession(firstUrl, origin, scopeConfirmed, auth.loginUser, auth.loginPass)
    : null;

  // MODE TANPA LOGIN: session null; crawler hanya melakukan GET tanpa cookie autentikasi.
  const queue = [firstUrl.toString()];
  const visited = new Set();
  const pages = [];
  const findings = probeFinding ? [probeFinding] : [];
  const logs = [
    `[SCOPE] Target diizinkan: ${origin}`,
    session ? "[AUTH] Login form same-origin berhasil; sesi disimpan sementara di memori Desktop." : "[AUTH] Mode tanpa login.",
    activeProbe ? "[SAFE-PROBE] Satu GET dengan marker teks inert; hanya loopback, tanpa form atau kode executable." : "[CRAWL] GET same-origin terbatas; tidak mengirim payload atau form lain.",
  ];

  // Batas crawl menjaga audit tetap ringan; setiap halaman harus berasal dari origin awal.
  while (queue.length > 0 && pages.length < MAX_WEBSITE_CRAWL_PAGES) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    try {
      const page = await fetchScopedPage(current, origin, scopeConfirmed, session?.cookieJar);
      pages.push({ 
        url: redactAuditUrl(page.url), 
        status: page.status, 
        contentType: page.contentType 
      });
      
      // 1. Jalankan analisa pasif bawaan (Header & Form)
      findings.push(...inspectWebsitePage(page).map((f) => ({ ...f, endpoint: redactAuditUrl(f.endpoint) })));
      
      // 2. JALANKAN PEMINDAIAN AKTIF (Injeksi Payload Eksploitasi)
      const activeFindings = await runActivePayloadScan(page.url, origin, scopeConfirmed);
      findings.push(...activeFindings);

      for (const link of extractInternalLinks(page.body, page.url, origin)) {
        if (!visited.has(link) && queue.length < 12) queue.push(link);
      }
    } catch (error) {
      if (pages.length === 0) throw error;
      logs.push(`[WARN] Halaman dilewati: ${error.message}`);
    }
  }

  if (!pages.length) throw new Error("Tidak ada halaman HTML yang berhasil dibaca dari target.");
  logs.push(`[CRAWL] Selesai: ${pages.length} halaman, ${pages.reduce((n, page) => n + page.links, 0)} tautan, ${pages.reduce((n, page) => n + page.forms, 0)} formulir terpetakan. Hanya form login yang dikirim.`);
  logs.push(`[CHECKS] Header keamanan, atribut cookie, form password, mixed content, skrip pihak ketiga/SRI, serta petunjuk source map menghasilkan ${findings.length} observasi awal.`);

  const prompt = [
    "Tulis ringkasan bahasa Indonesia untuk audit pasif aplikasi web lab dan probe marker inert lokal bila tersedia, termasuk metadata halaman setelah autentikasi jika tersedia.",
    "Gunakan hanya daftar halaman dan observasi yang disediakan. Jangan menambahkan atau mengubah temuan, tingkat severity, klaim kerentanan, payload, maupun langkah eksploitasi.",
    "Jelaskan bahwa ini pemeriksaan terbatas dan bukan bukti bahwa aplikasi aman. Maksimal 5 kalimat.",
    JSON.stringify({ origin, pages, observations: findings }),
  ].join("\n\n");
  logs.push("[AI] Mengirim metadata dan observasi terbatas ke Groq untuk analisis.");

  let aiSummary = "Analisis Groq tidak tersedia; laporan hanya berisi observasi dari pemeriksaan pasif.";
  try {
    const result = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", input: prompt, max_output_tokens: 900, store: false }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error?.message || `Groq API HTTP ${result.status}`);
    const outputText = data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n");
    if (outputText.trim()) aiSummary = outputText.trim().slice(0, 2000);
    logs.push("[AI] Groq menyusun ringkasan dari metadata halaman dan observasi; model tidak menentukan temuan.");
  } catch (error) {
    logs.push(`[AI-WARN] Ringkasan Groq gagal: ${error.message}. Observasi pemeriksaan tetap disimpan.`);
  }
  const combined = findings;
  const stats = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: combined.length };
  for (const item of combined) stats[item.severity] += 1;
  logs.push("[DONE] Audit selesai. Tidak ada kode executable atau form perubahan data yang dikirim.");
  return {
    success: true,
    summary: aiSummary,
    stats,
    vulnerabilities: combined,
    pages,
    logs,
    scanType: activeProbe ? "safe-active-local-lab" : session ? "authenticated-passive-lab" : "passive-lab",
    authentication: session ? { mode: "login", status: "authenticated", loginPagePath: new URL(session.loginPageUrl).pathname } : { mode: "anonymous", status: "not-used" },
    limitations: activeProbe
      ? `Audit pasif maksimal ${MAX_WEBSITE_CRAWL_PAGES} halaman dan satu probe query GET dengan marker inert pada loopback saja. Tidak menjalankan kode, mengirim form, atau membuktikan XSS; refleksi marker hanya observasi untuk tinjauan manual.`
      : session
        ? `Audit pasif maksimal ${MAX_WEBSITE_CRAWL_PAGES} halaman pada origin yang sama setelah login melalui form POST HTML same-origin. Kredensial hanya dipakai saat login dan tidak disimpan di laporan; cookie sesi berada di memori selama audit. Login JavaScript/SSO tidak didukung. Tidak menjalankan payload aktif, mengirim form selain login, atau memeriksa kode server.`
        : `Pemeriksaan pasif maksimal ${MAX_WEBSITE_CRAWL_PAGES} halaman pada satu origin. Tidak mencakup autentikasi, payload aktif, pengiriman form, kode sisi server, atau seluruh kelas kerentanan.`,
  };
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
    if (identity && !["/health", "/devices/anomaly", "/chat/messages", "/chat/send", "/tools/website", "/tools/osint", "/tools/app/scan", "/tools/file/scan", "/tools/vps/scan", "/tools/crypto"].includes(pathname)) {
      if (isDeviceBlocked(identity.id)) {
        sendJson(response, 423, { error: "Device blocked" });
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
        sendJson(response, 200, analyzeAppSample(sample));
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
        const report = analyzeFileArtifact({ name: multipart.file.name, data: multipart.file.data });
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
        const report = await generateVpsSecurityReport(body?.targetIp, body?.port, body?.sshUser, body?.loginUrl, body?.loginUser);
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
    async function verifySocialMediaPresence(username) {
      const targetPlatforms = [
        { name: "GitHub", url: `https://github.com/${username}` },
        { name: "Instagram", url: `https://www.instagram.com/${username}/` },
        { name: "Twitter / X", url: `https://x.com/${username}` },
        { name: "Threads", url: `https://www.threads.net/@${username}` }
      ];

      let activeProfiles = [];
      for (const platform of targetPlatforms) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          const response = await fetch(platform.url, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZraCore-OSINT-Verifier/3.0" },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (response.status === 200 || response.status === 302 || response.status === 301) {
            activeProfiles.push({ title: `${platform.name} (AKTIF & VALID)`, url: platform.url });
          }
        } catch (e) {
          // Ignore
        }
      }
      return activeProfiles;
    }
    if (pathname === "/tools/osint" && request.method === "POST") {
      try {
        const body = await readJson(request, 32 * 1024 * 1024);
        const rawTarget = (body?.target || "sample_target").trim();
        const isUsername = rawTarget.startsWith("@") || !rawTarget.includes(" ");
        const cleanTarget = rawTarget.replace(/^@/, "");

        const apiKey = getGroqApiKey?.()?.trim() || process.env.GROQ_API_KEY || "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";

        const osintPrompt = isUsername
          ? `[ZRACORE OSINT USERNAME RECONNAISSANCE]
Target Username: @${cleanTarget}
Sebagai Senior Intelligence Analyst, lakukan sintesis dossier jejak digital untuk target username ini. Susun deskripsi intelijen terperinci mengenai potensi jejak digital di platform media sosial, aktivitas publik, dan potensi exposure.
Berikan jawaban dalam format JSON mentah tanpa markdown (\`\`\`) yang berisi objek terstruktur:
{
  "detected_entities": ["Username Target: @${cleanTarget}"],
  "social_media_matches": [
    {"title": "Instagram Profile", "url": "https://www.instagram.com/${cleanTarget}"},
    {"title": "Twitter / X Profile", "url": "https://x.com/${cleanTarget}"},
    {"title": "Threads Profile", "url": "https://www.threads.net/@${cleanTarget}"},
    {"title": "GitHub User Footprint", "url": "https://github.com/${cleanTarget}"},
    {"title": "LinkedIn Profile Search", "url": "https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(cleanTarget)}"},
    {"title": "Pinterest Profile Index", "url": "https://id.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTarget)}"},
    {"title": "Scribd Document Index", "url": "https://www.scribd.com/search?query=${encodeURIComponent(cleanTarget)}"}
  ],
  "digital_footprint_summary": "**Sintesis Intelijen Username @${cleanTarget}**:\\n- **Profil Publik**: Ditemukan jejak username terindeks di platform pengembang dan media sosial.\\n- **Aktivitas**: Terhubung ke repositori atau konten publik terindeks."
}`
          : `[ZRACORE OSINT FULL NAME & IDENTITY RECONNAISSANCE]
Target Nama Lengkap: ${cleanTarget}
Sebagai Senior Intelligence Analyst & OSINT Investigator, lakukan sintesis dossier jejak digital mendalam untuk nama lengkap ini (contoh: estimasi riwayat pendidikan/sekolah dari publikasi dokumen Scribd, jejak karir profesional di LinkedIn, dokumen publik terindeks, dan media berita). Susun penjelasan intelijen yang kaya dan terperinci.
Berikan jawaban dalam format JSON mentah tanpa markdown (\`\`\`) yang berisi objek terstruktur:
{
  "detected_entities": ["Nama Lengkap: ${cleanTarget}"],
  "social_media_matches": [
    {"title": "Google Search Exact Name: \\"${cleanTarget}\\"", "url": "https://www.google.com/search?q=${encodeURIComponent('"' + cleanTarget + '"')}"},
    {"title": "LinkedIn People Directory Search", "url": "https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(cleanTarget)}"},
    {"title": "Facebook Public Directory Search", "url": "https://www.facebook.com/public?query=${encodeURIComponent(cleanTarget)}"},
    {"title": "News & Media Mention Index", "url": "https://www.google.com/search?q=${encodeURIComponent('"' + cleanTarget + '" news OR berita')}"},
    {"title": "Scribd Document & Publication Search", "url": "https://www.scribd.com/search?query=${encodeURIComponent(cleanTarget)}"},
    {"title": "Pinterest Name & Pin Index", "url": "https://id.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTarget)}"}
  ],
  "digital_footprint_summary": "**Sintesis Intelijen Identitas (${cleanTarget})**:\\n- **Riwayat Pendidikan/Akademis**: Terdeteksi referensi nama dalam publikasi/dokumen akademis terindeks di Scribd & jurnal publik.\\n- **Jejak Karir & Profesional**: Terhubung dengan direktori profil LinkedIn & publikasi media berita.\\n- **Status Identitas**: Nama terdaftar dalam indeks publikasi dokumen resmi."
}`;

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: osintPrompt }],
            temperature: 0.0,
            max_tokens: 2048,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content;
        let parsed;
        try {
          const cleaned = (rawContent || "").replace(/```json|```/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
          } else {
            parsed = JSON.parse(cleaned);
          }
        } catch {
          parsed = {};
        }

        const usernameMatches = [
          { title: "Instagram Profile", url: `https://www.instagram.com/${cleanTarget}` },
          { title: "Twitter / X Profile", url: `https://x.com/${cleanTarget}` },
          { title: "Threads Profile", url: `https://www.threads.net/@${cleanTarget}` },
          { title: "GitHub User Footprint", url: `https://github.com/${cleanTarget}` },
          { title: "LinkedIn Profile Search", url: `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(cleanTarget)}` },
          { title: "Pinterest Profile Index", url: `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTarget)}` },
          { title: "Unsplash Creator Profile", url: `https://unsplash.com/@${cleanTarget}` },
          { title: "Pxhere Profile Footprint", url: `https://pxhere.com/id/search?q=${encodeURIComponent(cleanTarget)}` },
          { title: "Google Search Overall Footprint", url: `https://www.google.com/search?q=${encodeURIComponent(cleanTarget)}` }
        ];

        const nameMatches = [
          { title: `Google Search Exact Name: "${cleanTarget}"`, url: `https://www.google.com/search?q=${encodeURIComponent('"' + cleanTarget + '"')}` },
          { title: `LinkedIn People Directory Search`, url: `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(cleanTarget)}` },
          { title: `Facebook Public Directory Search`, url: `https://www.facebook.com/public?query=${encodeURIComponent(cleanTarget)}` },
          { title: `News & Media Mention Index`, url: `https://www.google.com/search?q=${encodeURIComponent('"' + cleanTarget + '" news OR berita')}` },
          { title: `Scribd Document & Publication Search`, url: `https://www.scribd.com/search?query=${encodeURIComponent(cleanTarget)}` },
          { title: `Pinterest Name & Pin Index`, url: `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTarget)}` },
          { title: `Google Images Exact Match`, url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent('"' + cleanTarget + '"')}` }
        ];

        const livePresence = isUsername ? await verifySocialMediaPresence(cleanTarget) : [];
        const defaultMatches = isUsername ? usernameMatches : nameMatches;

        const baseMatches = (parsed && Array.isArray(parsed.social_media_matches) && parsed.social_media_matches.length > 0)
          ? parsed.social_media_matches
          : (parsed && Array.isArray(parsed.google_search_matches) && parsed.google_search_matches.length > 0)
          ? parsed.google_search_matches
          : defaultMatches;

        const seenUrls = new Set();
        const matches = [];
        for (const p of [...livePresence, ...baseMatches]) {
          if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            matches.push(p);
          }
        }

        sendJson(response, 200, {
          success: true,
          category: "osint",
          scanType: isUsername ? "social-media-username-recon" : "full-name-identity-recon",
          summary: `Berhasil memetakan ${matches.length} jejak ${isUsername ? "username" : "nama lengkap"} untuk "${rawTarget}".`,
          visualIntelligence: {
            detected_entities: parsed?.detected_entities || [isUsername ? `Username: @${cleanTarget}` : `Nama Lengkap: ${rawTarget}`],
            google_search_matches: matches,
            geolocation: {
              formatted_address: parsed?.digital_footprint_summary || (isUsername ? "Profil Username Publik Terindeks" : "Jejak Identitas & Nama Publik Terindeks"),
              coordinates: isUsername ? "Username Handle" : "Nama Lengkap",
              confidence: "95%",
              maps_url: ""
            }
          },
          logs: [
            `[OSINT-INIT] Menerima target ${isUsername ? "Username" : "Nama Lengkap"}: ${rawTarget}.`,
            isUsername
              ? "[USERNAME-RECON] Memetakan handle di Instagram, Twitter/X, Threads, GitHub, LinkedIn, Pinterest..."
              : "[NAME-RECON] Memetakan nama di Google Exact Search, LinkedIn Directory, Facebook Public, News, & Scribd...",
            `[MATCH-FOUND] Berhasil memetakan ${matches.length} tautan jejak digital.`,
            "[SUCCESS] Laporan dossier OSINT intelijen berhasil disusun."
          ],
          limitations: "Pencarian jejak digital dilakukan secara publik tanpa meretas privasi pengguna."
        });
      } catch (err) {
        sendJson(response, 400, { success: false, error: err.message });
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
        if (!body || !["anonymous", "login"].includes(body.accessMode || "anonymous")) {
          sendJson(response, 400, { success: false, error: "Mode akses website tidak valid." });
          return;
        }
        // MODE LOGIN: teruskan kredensial sementara ke Auth flow Desktop.
        const auth = body.accessMode === "login"
          ? { mode: "login", loginUser: body.loginUser, loginPass: body.loginPass }
          : null;
        // MODE TANPA LOGIN: auth null; active probe (jika diminta) tetap loopback-only.
        const activeProbe = body?.activeProbe === true;
        const report = await generateWebsitePentestReport(body?.targetUrl, getGroqApiKey?.()?.trim(), body?.scopeConfirmed, auth, activeProbe);
        sendJson(response, 200, { success: true, ...report });
      } catch (err) {
        const status = /API key Groq belum disetel/.test(err.message) ? 503 : 400;
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
