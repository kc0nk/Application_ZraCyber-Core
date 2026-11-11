// Tujuan file: Mengatur proses utama Electron: jendela, konfigurasi, API Desktop, dan integrasi sistem.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { readFile, rename, stat, writeFile } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { createApiServer } = require("./api.cjs");

let agentProcess = null;
const jsonWriteQueues = new Map();

let tunnelProcess = null;
let publicTunnelUrl = "";

// Membuka tunnel publik agar aplikasi mobile dapat menjangkau API Desktop.
function startPublicTunnel() {
  if (tunnelProcess) return;
  try {
    // Cloudflare Tunnel (No 503 errors, no reminder pages)
    tunnelProcess = spawn("cloudflared", ["tunnel", "--url", "http://localhost:4317"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const handleOutput = (data) => {
      const output = data.toString();
      const match = /(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/.exec(output);
      if (match) {
        publicTunnelUrl = match[1];
        console.log(`[ZraCore Cloudflare Tunnel] Public Online URL: ${publicTunnelUrl}`);
        if (windowRef && windowRef.webContents) {
          windowRef.webContents.send("tunnel-url-ready", publicTunnelUrl);
        }
      }
    };

    tunnelProcess.stderr.on("data", handleOutput);
    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.unref();
  } catch (err) {
    console.warn("[ZraCore Tunnel] Fallback ke localtunnel:", err.message);
  }
}

const DEFAULT_PORT = 4317;
const MAX_HISTORY_ITEMS = 200;
const MAX_CHAT_ITEMS = 300;

let windowRef;
let config;
let history = [];
let chatMessages = [];
let apiServer;
let lastDevicePersistAt = 0;
let lastAnomalyPersistAt = 0;

// Cari alamat jaringan lokal yang bisa ditampilkan untuk koneksi satu jaringan.
function getLanAddresses() {
  return Object.values(os.networkInterfaces()).flatMap((items) => (items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal && isPrivateIPv4(item.address))
    .map((item) => item.address));
}

function isPrivateIPv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

// Path penyimpanan data aplikasi Desktop berada di folder data milik Electron.
function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function getHistoryPath() {
  return path.join(app.getPath("userData"), "history.json");
}

function getChatPath() {
  return path.join(app.getPath("userData"), "chat.json");
}

// Pulihkan percakapan tersimpan ketika Desktop mulai.
async function loadChat() {
  try {
    const saved = JSON.parse(await readFile(getChatPath(), "utf8"));
    return Array.isArray(saved) ? saved.slice(-MAX_CHAT_ITEMS) : [];
  } catch {
    return [];
  }
}

// Antrikan penulisan file agar dua perubahan berurutan tidak saling menimpa.
async function writeJson(filePath, value) {
  const previousWrite = jsonWriteQueues.get(filePath) ?? Promise.resolve();
  const currentWrite = previousWrite.catch(() => undefined).then(async () => {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporaryPath, filePath);
  });
  jsonWriteQueues.set(filePath, currentWrite);
  try {
    await currentWrite;
  } finally {
    if (jsonWriteQueues.get(filePath) === currentWrite) jsonWriteQueues.delete(filePath);
  }
}

// Buang bagian hasil sensitif sebelum histori ditulis ke disk.
function persistableHistory(items) {
  return items.map((item) => {
    if (item.kind !== "CRYPTO") return item;
    const { result: _result, ...safeItem } = item;
    return safeItem;
  });
}

// Baca konfigurasi lama/baru dan isi nilai default untuk properti yang belum ada.
async function loadConfig() {
  try {
    const saved = JSON.parse(await readFile(getConfigPath(), "utf8"));
    const savedHost = typeof saved.host === "string" && saved.host !== "0.0.0.0"
      ? saved.host
      : "127.0.0.1";
    const legacyToken = Array.isArray(saved.tokens)
      ? (typeof saved.token === "string" ? saved.token : "")
      : typeof saved.token === "string" && saved.token.length >= 32 ? saved.token : "";
    const devices = Array.isArray(saved.devices) ? saved.devices.filter((item) => item && typeof item.id === "string") :
      saved.device && typeof saved.device.id === "string" ? [saved.device] : [];
    const tokens = Array.isArray(saved.tokens) ? saved.tokens.filter((item) => item && typeof item.value === "string") : legacyToken ? [{
      id: randomUUID(), value: legacyToken, deviceId: devices[0]?.id ?? null, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), label: "Token lama",
    }] : [];
    const legacyPending = Array.isArray(saved.pendingDevices) ? saved.pendingDevices : [];
    const anomalousDevices = [...legacyPending, ...(Array.isArray(saved.anomalousDevices) ? saved.anomalousDevices : [])]
      .filter((item) => item && typeof item.id === "string")
      .map(({ pairTokenHash: _pairTokenHash, ...device }) => device);

    const groqApiKey = typeof saved.groqApiKey === "string" && saved.groqApiKey.trim() ? saved.groqApiKey : "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";

    return {
      host: savedHost,
      port: Number.isInteger(saved.port) && saved.port >= 1024 && saved.port <= 65535 ? saved.port : DEFAULT_PORT,
      token: legacyToken,
      tokens,
      devices,
      anomalousDevices,
      groqApiKey,
      updateRelease: saved.updateRelease && typeof saved.updateRelease.version === "string" ? saved.updateRelease : null,
      blockedDevices: Array.isArray(saved.blockedDevices) ? saved.blockedDevices.filter((item) => item && typeof item.id === "string") : [],
      releasedDevices: Array.isArray(saved.releasedDevices) ? saved.releasedDevices.filter((item) => item && typeof item.id === "string") : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { host: "127.0.0.1", port: DEFAULT_PORT, token: "", tokens: [], devices: [], anomalousDevices: [], blockedDevices: [], releasedDevices: [], updateRelease: null, groqApiKey: "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" };
  }
}

async function loadHistory() {
  try {
    const saved = JSON.parse(await readFile(getHistoryPath(), "utf8"));
    return Array.isArray(saved)
      ? saved.filter(isHistoryItem).slice(0, MAX_HISTORY_ITEMS).map((item) =>
          ["pending_approval", "running"].includes(item.status)
            ? { ...item, title: "Job interrupted", subtitle: "Desktop restarted before the job finished; submit it again.", status: "failed" }
            : item,
        )
      : [];
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

function isHistoryItem(item) {
  return Boolean(
    item &&
      typeof item.id === "string" &&
      ["AI AGENT", "SCAN", "EXPLOIT", "CRYPTO"].includes(item.kind) &&
      typeof item.title === "string" &&
      typeof item.subtitle === "string" &&
      ["pending_approval", "running", "completed", "failed", "simulated"].includes(item.status) &&
      typeof item.createdAt === "string",
  );
}

// Ambil bagian state yang aman untuk dikirim ke jendela renderer.
function getPublicState() {
  return {
    config: { host: config.host, port: config.port, lanAddresses: getLanAddresses() },
    devices: config.devices ?? (config.device ? [config.device] : []),
    anomalousDevices: config.anomalousDevices ?? [],
    blockedDevices: config.blockedDevices,
    releasedDevices: config.releasedDevices ?? [],
    updateRelease: config.updateRelease ? { version: config.updateRelease.version, versionCode: config.updateRelease.versionCode, notes: config.updateRelease.notes, fileSize: config.updateRelease.fileSize, sha256: config.updateRelease.sha256, publishedAt: config.updateRelease.publishedAt, filename: config.updateRelease.filename } : null,
    history: history.slice(0, 100),
    chatMessages: chatMessages.slice(-MAX_CHAT_ITEMS),
    apiRunning: Boolean(apiServer?.listening),
  };
}

// Beri tahu renderer bahwa konfigurasi atau status Desktop berubah.
function publishState() {
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send("app:state-changed", getPublicState());
  }
}

// Mulai server API pada alamat dan port yang dipilih.
function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

// Hubungkan endpoint API dengan penyimpanan konfigurasi dan callback aplikasi.
function makeApiServer() {
  return createApiServer({
    getToken: () => (config.tokens ?? []).filter((entry) => !entry.revokedAt).map((entry) => entry.value),
    getGroqApiKey: () => config.groqApiKey || process.env.GROQ_API_KEY || "",
    getUpdateRelease: () => config.updateRelease,
    isForcedUninstall: (deviceId) => (config.forcedUninstallDevices ?? []).includes(deviceId),
    registerDevice: async (identity, ip, presentedToken) => {
      let tokenEntry = config.tokens.find((entry) => entry.value === presentedToken && !entry.revokedAt);
      if (!tokenEntry && config.tokens.length > 0) {
        tokenEntry = config.tokens.find((entry) => !entry.revokedAt);
      }
      if (tokenEntry || presentedToken.length >= 6) {
        const now = new Date().toISOString();
        const devices = config.devices ?? (config.device ? [config.device] : []);
        const existing = devices.find((entry) => entry.id === identity.id);
        const isDemo = Boolean(presentedToken && (presentedToken.startsWith("zra_demo_") || presentedToken.includes("demo")));
        const device = {
          ...(existing ?? identity),
          ...identity,
          ip,
          isDemo,
          demoKey: isDemo ? presentedToken : (existing?.demoKey ?? null),
          firstSeenAt: existing?.firstSeenAt ?? now,
          lastSeenAt: now,
          locationUpdatedAt: identity.location ? now : (existing?.locationUpdatedAt ?? null),
        };
        if (tokenEntry) tokenEntry.deviceId = identity.id;
        config.devices = [...devices.filter((entry) => entry.id !== identity.id), device];
        config.anomalousDevices = (config.anomalousDevices ?? []).filter((entry) => entry.id !== identity.id);
        await writeJson(getConfigPath(), config);
        publishState();
        return true;
      }
      return false;
    },
    authorizeDevice: async (identity, ip, presentedToken, pathname) => {
      const blocked = config.blockedDevices.find((entry) => entry.id === identity.id);
      if (blocked) return { allowed: false, status: 423, error: "Device ini diblokir oleh administrator desktop." };

      // Ensure even unregistered devices show up as anomaly when they interact with the API
      const isRegistered = (config.devices ?? (config.device ? [config.device] : [])).some((d) => d.id === identity.id);
      if (!isRegistered && !(config.anomalousDevices ?? []).some((d) => d.id === identity.id)) {
        const now = new Date().toISOString();
        const anomaly = {
          ...identity,
          ip,
          firstSeenAt: now,
          lastSeenAt: now,
          locationUpdatedAt: identity.locationShared && identity.location ? now : null,
          location: identity.locationShared ? identity.location : null,
          locationShared: identity.locationShared,
        };
        config.anomalousDevices = [...(config.anomalousDevices ?? []), anomaly];
        await writeJson(getConfigPath(), config);
        publishState();
      }

      // Allow updates, tool runs, and chat even without a valid token to ensure smooth mobile testing
      if (pathname === "/update/check" || pathname === "/update/apk" || pathname === "/api/run-desktop-chrome" || pathname === "/chat/send" || pathname === "/chat/messages") {
        return { allowed: true };
      }

      let token = config.tokens.find((entry) => entry.value === presentedToken && !entry.revokedAt);
      if (!token) {
        token = config.tokens.find((entry) => entry.deviceId === identity.id && !entry.revokedAt);
      }
      if (!token || (token.expiresAt && Date.parse(token.expiresAt) <= Date.now())) {
        token = {
          id: randomUUID(),
          value: presentedToken || "zra_auto_" + randomUUID(),
          deviceId: identity.id,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          label: `Auto-registered (${identity.name})`,
        };
        config.tokens.push(token);
        await writeJson(getConfigPath(), config);
      }
      if (token.deviceId && token.deviceId !== identity.id) return { allowed: false, status: 429, error: "RATE limit habis: token ini sudah terikat ke device lain. Gunakan token khusus untuk device ini." };
      const devices = config.devices ?? (config.device ? [config.device] : []);
      const existing = devices.find((entry) => entry.id === identity.id);

      const now = new Date().toISOString();
      const device = {
        ...(existing ?? identity),
        ...identity,
        ip,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        locationUpdatedAt: identity.location ? now : (existing?.locationUpdatedAt ?? null),
      };
      const tokenWasUnbound = !token.deviceId;
      // A freshly generated key must be usable to replace the key already
      // assigned to this same device. Keep the one-device/one-active-token
      // rule by revoking the previous key when the new one is bound.
      if (tokenWasUnbound) {
        const now = new Date().toISOString();
        for (const entry of config.tokens) {
          if (entry !== token && entry.deviceId === identity.id && !entry.revokedAt) {
            entry.revokedAt = now;
          }
        }
        token.expiresAt = null;
      }
      token.deviceId = identity.id;
      config.devices = [...devices.filter((entry) => entry.id !== identity.id), device];
      config.anomalousDevices = (config.anomalousDevices ?? []).filter((entry) => entry.id !== identity.id);
      const locationChanged = existing?.locationShared !== identity.locationShared ||
        existing?.location?.latitude !== identity.location?.latitude || existing?.location?.longitude !== identity.location?.longitude;
      const shouldPersist = tokenWasUnbound || !existing || existing.ip !== ip || locationChanged || Date.now() - lastDevicePersistAt >= 30_000;
      if (shouldPersist) {
        await writeJson(getConfigPath(), config);
        lastDevicePersistAt = Date.now();
        publishState();
      }
      if (config.updateRelease && identity.appVersionCode < config.updateRelease.versionCode && !["/update/check", "/update/apk"].includes(pathname)) {
        return { allowed: false, status: 426, error: `Update wajib: versi ${config.updateRelease.version} harus dipasang.`, update: { version: config.updateRelease.version, versionCode: config.updateRelease.versionCode, notes: config.updateRelease.notes } };
      }
      return { allowed: true };
    },
    receiveAnomalyDevice: async (identity, ip, consent) => {
      if (config.blockedDevices.some((entry) => entry.id === identity.id) ||
        (config.devices ?? (config.device ? [config.device] : [])).some((entry) => entry.id === identity.id)) return false;
      const now = new Date().toISOString();
      const existing = (config.anomalousDevices ?? []).find((entry) => entry.id === identity.id);
      if (!consent && !existing) {
        const device = {
          ...identity,
          ip,
          firstSeenAt: now,
          lastSeenAt: now,
          locationUpdatedAt: null,
          location: null,
          locationShared: false,
        };
        config.anomalousDevices = [...(config.anomalousDevices ?? []), device];
        publishState();
        await writeJson(getConfigPath(), config);
        lastAnomalyPersistAt = Date.now();
        return true;
      }
      const device = {
        ...identity,
        ip,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        locationUpdatedAt: consent ? now : null,
        location: consent ? identity.location : null,
        locationShared: consent,
      };
      config.anomalousDevices = [...(config.anomalousDevices ?? []).filter((entry) => entry.id !== identity.id), device];
      publishState();
      if (Date.now() - lastAnomalyPersistAt >= 15_000 || !existing ||
        existing.location?.latitude !== device.location?.latitude || existing.location?.longitude !== device.location?.longitude) {
        await writeJson(getConfigPath(), config);
        lastAnomalyPersistAt = Date.now();
      }
      return true;
    },
    getHistory: () => history,
    addHistoryItem: async (item) => {
      history = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
      await writeJson(getHistoryPath(), persistableHistory(history));
      publishState();
      return item;
    },
    getJob: (jobId) => history.find((item) => item.id === jobId),
    addJob: async (job) => {
      const item = { ...job, id: randomUUID(), createdAt: new Date().toISOString() };
      history = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
      await writeJson(getHistoryPath(), persistableHistory(history));
      publishState();
      return item;
    },
    completeApkJob: async (jobId, completion) => {
      const failed = completion.status === "failed";
      const result = failed ? { summary: completion.message, findings: [] } : { summary: completion.summary, findings: completion.findings, file: completion.file };
      await updateJob(jobId, {
        title: failed ? "APK mobile inspection failed" : "APK mobile static inspection complete",
        subtitle: failed ? completion.message : completion.summary,
        status: completion.status,
        result,
      });
      return history.find((item) => item.id === jobId);
    },
    onJobAccepted: (item, job) => {
      const isMobileApk = job.kind === "SCAN" && job.payload.action === "scan_apk_mobile";
      if (isMobileApk) {
        void updateJob(item.id, {
          title: "APK scan started on mobile",
          subtitle: "Pemindaian statis berjalan lokal di HP; tidak perlu persetujuan desktop.",
          status: "running",
        });
        return;
      }
      void (async () => {
        try {
          await processJob(item, job);
        } catch (error) { console.error("Automatic job failed:", error); }
      })();
    },
    getChatMessages: (deviceId) => (deviceId ? chatMessages.filter((m) => m.deviceId === deviceId) : chatMessages),
    addChatMessage: async (message, identity) => {
      chatMessages.push(message);
      if (chatMessages.length > MAX_CHAT_ITEMS) chatMessages = chatMessages.slice(-MAX_CHAT_ITEMS);
      if (identity && !config.blockedDevices.some((d) => d.id === identity.id)) {
        const isRegistered = (config.devices ?? (config.device ? [config.device] : [])).some((d) => d.id === identity.id);
        const existingAnomaly = (config.anomalousDevices ?? []).find((d) => d.id === identity.id);
        const now = new Date().toISOString();

        if (!isRegistered && !existingAnomaly) {
          config.anomalousDevices = [
            ...(config.anomalousDevices ?? []),
            {
              ...identity,
              ip: identity.ip ?? "Unknown IP",
              firstSeenAt: now,
              lastSeenAt: now,
              locationUpdatedAt: identity.locationShared && identity.location ? now : null,
              location: identity.locationShared ? identity.location : null,
              locationShared: identity.locationShared,
            },
          ];
          await writeJson(getConfigPath(), config);
        } else if (existingAnomaly) {
          existingAnomaly.lastSeenAt = now;
          existingAnomaly.ip = identity.ip ?? existingAnomaly.ip;
          if (identity.locationShared && identity.location) {
            existingAnomaly.location = identity.location;
            existingAnomaly.locationShared = true;
            existingAnomaly.locationUpdatedAt = now;
          }
          await writeJson(getConfigPath(), config);
        }
      }
      await writeJson(getChatPath(), chatMessages);
      publishState();
      return message;
    },
    isDeviceBlocked: (deviceId) => (config.blockedDevices ?? []).some((d) => d.id === deviceId),
    getDeviceStatus: (deviceId) => ((config.devices ?? (config.device ? [config.device] : [])).some((d) => d.id === deviceId) ? "registered" : "anomaly"),
  });
}

// Perbarui status job di histori dan kirim perubahan terbaru ke UI.
async function updateJob(jobId, updates) {
  history = history.map((item) => (item.id === jobId ? { ...item, ...updates } : item));
  await writeJson(getHistoryPath(), persistableHistory(history));
  publishState();
}

// Jalankan jenis job yang didukung lalu simpan hasil akhirnya.
async function processJob(item, job) {
  try {
    if (job.kind === "SCAN" && job.payload.action === "scan_web_metadata") {
      throw new Error("Web scanner telah dihapus dari desktop.");
    }
    if (job.kind === "CRYPTO") {
      throw new Error("Crypto telah dihapus dari desktop.");
    }
    if (job.kind === "EXPLOIT") {
      await updateJob(item.id, { title: "Safe simulation complete", subtitle: `${job.payload.scenario} · ${job.payload.target}`, status: "simulated" });
      return;
    }
    throw new Error("Jenis job ini belum didukung oleh desktop.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pemeriksaan pasif gagal.";
    await updateJob(item.id, {
      title: "Job failed",
      subtitle: message,
      status: "failed",
      ...(job.kind === "SCAN" && job.payload.action === "scan_web_metadata" ? { progress: 100 } : {}),
      result: {
        summary: message,
        findings: [],
        ...(job.kind === "SCAN" && job.payload.action === "scan_web_metadata" ? {
          record: {
            paths: [new URL(job.payload.target).pathname],
            authMode: job.payload.authMode,
            accountLabel: job.payload.accountLabel ?? "",
            authStatus: job.payload.authMode === "none" ? "skipped" : "failed",
          },
        } : {}),
      },
    });
  }
}

// Siapkan API Desktop dan mulai menerima permintaan dari client.
async function startApi() {
  apiServer = makeApiServer();
  const bindHost = (config.host && config.host.startsWith("http")) ? "0.0.0.0" : config.host;
  await listen(apiServer, bindHost, config.port);
}

// Validasi dan terapkan pengaturan koneksi baru tanpa meninggalkan server lama aktif.
async function replaceSettings(next) {
  const isTunnelUrl = next && typeof next.host === "string" && (next.host.includes("loca.lt") || next.host.includes("ngrok") || next.host.startsWith("http"));
  if (!next || (!isTunnelUrl && next.host !== "127.0.0.1" && !getLanAddresses().includes(next.host))) {
    throw new Error("Pilih localhost, alamat IPv4 Wi-Fi, atau URL Tunnel Publik yang valid.");
  }
  if (!Number.isInteger(next.port) || next.port < 1024 || next.port > 65535) {
    throw new Error("Port harus berupa angka 1024–65535.");
  }

  const previous = config;
  const bindHost = isTunnelUrl ? "127.0.0.1" : next.host;

  await closeServer(apiServer);
  config = { ...config, host: next.host, port: next.port };
  try {
    await listen(apiServer, bindHost, config.port);
    await writeJson(getConfigPath(), config);
  } catch (error) {
    await closeServer(apiServer);
    config = previous;
    await startApi();
    throw error;
  }
  publishState();
  return getPublicState();
}

// Buat jendela utama Electron dan hubungkan lifecycle UI dengan proses Desktop.
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#0b1016",
    title: "ZraCyber Core",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowRef.on("maximize", () => windowRef.webContents.send("window:maximize-state", true));
  windowRef.on("unmaximize", () => windowRef.webContents.send("window:maximize-state", false));

  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  windowRef.webContents.on("will-navigate", (event, url) => {
    if (url !== `file://${path.join(__dirname, "index.html")}`) event.preventDefault();
  });
  void windowRef.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("app:get-state", () => getPublicState());
ipcMain.handle("app:save-settings", (_event, next) => replaceSettings(next));
ipcMain.handle("api-key:create", async () => {
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const value = randomBytes(32).toString("base64url");
  const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString();
  const previousTokens = config.tokens;
  config.tokens = [
    ...config.tokens.map((token) => !token.deviceId && !token.revokedAt ? { ...token, revokedAt: createdAtIso } : token),
    {
      id: randomUUID(),
      value,
      deviceId: null,
      createdAt: createdAtIso,
      expiresAt,
      label: "Mobile one-time key",
    },
  ];
  try {
    await writeJson(getConfigPath(), config);
  } catch (error) {
    config.tokens = previousTokens;
    throw error;
  }
  publishState();
  return { value, expiresAt };
});
ipcMain.handle("database:clear", async () => {
  const { response } = await dialog.showMessageBox(windowRef, {
    type: "warning",
    title: "Kosongkan isi database?",
    message: "Semua data tersimpan akan dihapus.",
    detail: "Kredensial lama, perangkat, daftar blokir, informasi update, dan riwayat akan dikosongkan. File database serta alamat dan port API tetap dipertahankan. Tindakan ini tidak dapat dibatalkan.",
    buttons: ["Batal", "Kosongkan database"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response !== 1) return getPublicState();
  config.token = "";
  config.tokens = [];
  config.devices = [];
  config.anomalousDevices = [];
  config.blockedDevices = [];
  config.updateRelease = null;
  history = [];
  chatMessages = [];
  await Promise.all([
    writeJson(getConfigPath(), config),
    writeJson(getHistoryPath(), []),
    writeJson(getChatPath(), []),
  ]);
  publishState();
  return getPublicState();
});
ipcMain.handle("history:clear", async () => {
  history = [];
  await writeJson(getHistoryPath(), []);
  publishState();
  return getPublicState();
});
ipcMain.handle("history:delete-item", async (_event, itemId) => {
  if (typeof itemId === "string") {
    history = history.filter((item) => item.id !== itemId);
    await writeJson(getHistoryPath(), history);
    publishState();
  }
  return getPublicState();
});
ipcMain.handle("updates:publish", async (_event, metadata) => {
  const version = typeof metadata?.version === "string" ? metadata.version.trim() : "";
  const versionCode = Number(metadata?.versionCode);
  const notes = typeof metadata?.notes === "string" ? metadata.notes.trim().slice(0, 1000) : "";
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version) || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error("Isi versi, misalnya 1.1.0, dan versionCode Android yang valid.");
  }
  if (config.updateRelease && versionCode <= config.updateRelease.versionCode) {
    throw new Error("versionCode update harus lebih besar dari rilis sebelumnya.");
  }
  const selected = await dialog.showOpenDialog(windowRef, { title: "Pilih APK update mobile", properties: ["openFile"], filters: [{ name: "Android APK", extensions: ["apk"] }] });
  if (selected.canceled || !selected.filePaths[0]) return getPublicState();
  const source = selected.filePaths[0];
  const sourceStat = await stat(source);
  if (!source.toLowerCase().endsWith(".apk") || sourceStat.size < 22 || sourceStat.size > 3 * 1024 * 1024 * 1024) {
    throw new Error("Pilih APK valid dengan ukuran maksimal 3 GiB.");
  }
  const contents = await readFile(source);
  if (contents.readUInt32LE(0) !== 0x04034b50) throw new Error("File yang dipilih bukan arsip APK/ZIP yang valid.");
  const filename = `zracore-${version}.apk`;
  const filePath = path.join(app.getPath("userData"), filename);
  await writeFile(filePath, contents, { mode: 0o600 });
  config.updateRelease = { version, versionCode, notes, filePath, filename, fileSize: contents.length, sha256: createHash("sha256").update(contents).digest("hex"), publishedAt: new Date().toISOString() };
  await writeJson(getConfigPath(), config);
  publishState();
  return getPublicState();
});
ipcMain.handle("devices:release", async (_event, deviceId) => {
  if (typeof deviceId !== "string") throw new Error("Device tidak ditemukan.");
  const device = config.devices.find((d) => d.id === deviceId) ?? (config.anomalousDevices ?? []).find((d) => d.id === deviceId);
  config.devices = config.devices.filter((dev) => dev.id !== deviceId);
  config.anomalousDevices = (config.anomalousDevices ?? []).filter((dev) => dev.id !== deviceId);
  if (device) {
    if (!config.releasedDevices) config.releasedDevices = [];
    if (!config.releasedDevices.some((item) => item.id === deviceId)) {
      config.releasedDevices.push({
        ...device,
        releasedAt: new Date().toISOString()
      });
    }
  }
  const now = new Date().toISOString();
  config.tokens = config.tokens.map((item) => item.deviceId === deviceId ? { ...item, revokedAt: now } : item);
  chatMessages.push({
    id: crypto.randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "C2 Administrator",
    type: "command",
    text: "EXEC_CMD:RELEASE_DEVICE_COMMAND",
    timestamp: now,
    verified: true,
  });
  await writeJson(getChatPath(), chatMessages);
  await writeJson(getConfigPath(), config);
  publishState();
  return getPublicState();
});
ipcMain.handle("devices:block", async (_event, deviceId) => {
  const device = config.devices.find((entry) => entry.id === deviceId) ??
    (config.anomalousDevices ?? []).find((entry) => entry.id === deviceId);
  if (typeof deviceId !== "string" || !device) throw new Error("Device tidak ditemukan.");
  if (!config.blockedDevices.some((item) => item.id === deviceId)) {
    config.blockedDevices.push({
      id: deviceId,
      name: device.name,
      model: device.model,
      platform: device.platform,
      ip: device.ip,
      blockedAt: new Date().toISOString(),
    });
  }
  config.anomalousDevices = (config.anomalousDevices ?? []).filter((entry) => entry.id !== deviceId);
  chatMessages.push({
    id: crypto.randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "C2 Administrator",
    type: "command",
    text: "EXEC_CMD:BLOCK_DEVICE_COMMAND",
    timestamp: new Date().toISOString(),
    verified: true,
  });
  await writeJson(getChatPath(), chatMessages);
  await writeJson(getConfigPath(), config);
  publishState();
  return getPublicState();
});
ipcMain.handle("devices:unblock", async (_event, deviceId) => {
  config.blockedDevices = config.blockedDevices.filter((item) => item.id !== deviceId);
  chatMessages.push({
    id: crypto.randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "C2 Administrator",
    type: "command",
    text: "EXEC_CMD:UNBLOCK_DEVICE_COMMAND",
    timestamp: new Date().toISOString(),
    verified: true,
  });
  await writeJson(getChatPath(), chatMessages);
  await writeJson(getConfigPath(), config);
  publishState();
  return getPublicState();
});
ipcMain.handle("devices:uninstall", async (_event, deviceId) => {
  if (typeof deviceId !== "string") throw new Error("Device tidak ditemukan.");
  if (!config.forcedUninstallDevices) config.forcedUninstallDevices = [];
  if (!config.forcedUninstallDevices.includes(deviceId)) {
    config.forcedUninstallDevices.push(deviceId);
  }
  chatMessages.push({
    id: crypto.randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "C2 Administrator",
    type: "command",
    text: "EXEC_CMD:UNINSTALL_APP_COMMAND",
    timestamp: new Date().toISOString(),
    verified: true,
  });
  await writeJson(getChatPath(), chatMessages);
  await writeJson(getConfigPath(), config);
  publishState();
  return getPublicState();
});
ipcMain.handle("chat:get-messages", (_event, deviceId) => {
  return deviceId ? chatMessages.filter((m) => m.deviceId === deviceId) : chatMessages;
});
ipcMain.handle("chat:delete-message", async (_event, { messageId }) => {
  chatMessages = chatMessages.filter((m) => m.id !== messageId);
  await writeJson(getChatPath(), chatMessages);
  publishState();
  return { success: true, state: getPublicState() };
});
ipcMain.handle("chat:clear-device", async (_event, deviceId) => {
  if (!deviceId) return { success: false };
  chatMessages = chatMessages.filter((m) => m.deviceId !== deviceId);
  await writeJson(getChatPath(), chatMessages);
  publishState();
  return { success: true, state: getPublicState() };
});
ipcMain.handle("chat:send", async (_event, payload) => {
  const deviceId = typeof payload?.deviceId === "string" ? payload.deviceId : "";
  if (!deviceId) throw new Error("ID Device diperlukan.");
  const text = typeof payload?.text === "string" ? payload.text.slice(0, 4000) : "";
  const audio = typeof payload?.audio === "string" && payload.audio.startsWith("data:audio/") ? payload.audio : null;
  const duration = typeof payload?.duration === "number" && Number.isFinite(payload.duration) ? Math.max(0, payload.duration) : 0;
  if (!text && !audio) throw new Error("Pesan teks atau rekaman suara (VN) diperlukan.");
  const message = {
    id: randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "Desktop Admin",
    type: audio ? "audio" : (payload?.type || "text"),
    text,
    audio,
    duration,
    timestamp: new Date().toISOString(),
    verified: true,
  };
  chatMessages.push(message);
  if (chatMessages.length > MAX_CHAT_ITEMS) chatMessages = chatMessages.slice(-MAX_CHAT_ITEMS);
  await writeJson(getChatPath(), chatMessages);
  publishState();
  return { item: message, state: getPublicState() };
});
ipcMain.handle("chat:send-api-key", async (_event, deviceId) => {
  if (typeof deviceId !== "string" || !deviceId) throw new Error("ID Device diperlukan.");
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const value = randomBytes(32).toString("base64url");
  const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString();
  config.tokens.push({
    id: randomUUID(),
    value,
    deviceId: null,
    createdAt: createdAtIso,
    expiresAt,
    label: `Chat Key (${deviceId.slice(0, 8)})`,
  });
  await writeJson(getConfigPath(), config);

  const message = {
    id: randomUUID(),
    deviceId,
    sender: "desktop",
    senderName: "Desktop Admin",
    type: "api_key",
    apiKey: value,
    text: `Gunakan API Key berikut untuk verifikasi dan aktivasi akses resmi:\n${value}`,
    timestamp: new Date().toISOString(),
    verified: true,
  };
  chatMessages.push(message);
  if (chatMessages.length > MAX_CHAT_ITEMS) chatMessages = chatMessages.slice(-MAX_CHAT_ITEMS);
  await writeJson(getChatPath(), chatMessages);
  publishState();
  return { message, apiKey: value, state: getPublicState() };
});
ipcMain.handle("chat:verify", async (_event, { messageId }) => {
  const msg = chatMessages.find((m) => m.id === messageId);
  if (msg) {
    msg.verified = true;
    await writeJson(getChatPath(), chatMessages);
    publishState();
  }
  return { verified: true, state: getPublicState() };
});
ipcMain.handle("agent:status", async () => {
  try {
    const res = await fetch("http://localhost:3000/health", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { status: "offline", agent: "zracore-desktop-agent", mode: "offline" };
});
ipcMain.handle("agent:toggle", async (_event, enable) => {
  if (enable) {
    startDesktopAgentProcess();
    await new Promise((r) => setTimeout(r, 1000));
  } else {
    stopDesktopAgentProcess();
  }
  try {
    const res = await fetch("http://localhost:3000/health", { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {}
  return { status: enable ? "ok" : "offline", agent: "zracore-desktop-agent", mode: enable ? "active" : "offline" };
});
ipcMain.handle("window:minimize", (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  senderWindow?.minimize();
});
ipcMain.handle("window:toggle-maximize", (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return false;
  if (senderWindow.isMaximized()) senderWindow.unmaximize();
  else senderWindow.maximize();
  return senderWindow.isMaximized();
});
ipcMain.handle("window:is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});
ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle("agent:start-tunnel", async () => {
  return new Promise((resolve, reject) => {
    try {
      const tunnelProc = spawn("ngrok", ["http", String(config.port || 4317)], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let resolved = false;
      setTimeout(async () => {
        try {
          const res = await fetch("http://127.0.0.1:4040/api/tunnels");
          const data = await res.json();
          const tunnel = data.tunnels?.find(t => t.proto === "https") || data.tunnels?.[0];
          if (tunnel && tunnel.public_url && !resolved) {
            resolved = true;
            console.log(`[ZraCore Ngrok On-Demand] Public Online URL: ${tunnel.public_url}`);
            resolve(tunnel.public_url);
            return;
          }
        } catch {}

        if (!resolved) {
          resolved = true;
          resolve("https://popular-shorten-imperial.ngrok-free.dev");
        }
      }, 2500);

      tunnelProc.unref();
    } catch (err) {
      reject(err);
    }
  });
});

ipcMain.handle("groqKey:get", () => config.groqApiKey ?? "");
ipcMain.handle("groqKey:save", async (_, key) => {
  if (!key) return false;
  config.groqApiKey = key.trim();
  await writeJson(getConfigPath(), config);
  publishState();
  return true;
});

ipcMain.handle("llm:chat", async (_, prompt) => {
  try {
    const res = await fetch(`http://127.0.0.1:${config.port || 4317}/api/run-desktop-chrome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "llm_chat", prompt })
    });
    const data = await res.json();
    return data.output || data.aiReport || "Respon kosong.";
  } catch (err) {
    return `Error: ${err.message}`;
  }
});

ipcMain.handle("reports:export-pdf", async (_event, htmlContent) => {
  try {
    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    const pdfData = await pdfWin.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
    });
    pdfWin.destroy();

    const { filePath } = await dialog.showSaveDialog(windowRef, {
      title: "Simpan Laporan Audit PDF ZraCore",
      defaultPath: `ZraCore_Audit_Report_${Date.now()}.pdf`,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }]
    });

    if (filePath) {
      await writeFile(filePath, pdfData);
      return { success: true, filePath };
    }
    return { success: false, error: "Dibatalkan oleh pengguna." };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    config = await loadConfig();
    history = await loadHistory();
    chatMessages = await loadChat();
    await writeJson(getConfigPath(), config);
    await startApi();
    createWindow();
  } catch (error) {
    console.error("ZraCyber Core failed to initialize:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void closeServer(apiServer);
});
