// Kontrak data untuk pemindai privasi Android lokal.
import { NativeModules, Platform } from "react-native";

export type DeviceAccessEntry = {
  packageName: string;
  appName: string;
  serviceName?: string;
};

export type SensitiveAppPermission = DeviceAccessEntry & {
  isSystemApp: boolean;
  installerPackage: string | null;
  microphoneRequested: boolean;
  microphoneGranted: boolean;
  cameraRequested: boolean;
  cameraGranted: boolean;
};

export type DevicePrivacySnapshot = {
  platform: "android";
  installedPackageCount: number;
  appsWithSensitivePermissions: SensitiveAppPermission[];
  activeAccessibilityServices: DeviceAccessEntry[];
  activeNotificationListeners: DeviceAccessEntry[];
  activeDeviceAdmins: DeviceAccessEntry[];
};

// Pindai metadata aplikasi di perangkat sendiri; tidak meminta data ke Desktop.
export async function scanLocalDevicePrivacy(): Promise<DevicePrivacySnapshot> {
  if (Platform.OS !== "android") throw new Error("Pemeriksaan ini hanya tersedia di Android.");
  const scanner = NativeModules.ZraDevicePrivacyScanner as { scanPrivacy?: () => Promise<DevicePrivacySnapshot> } | undefined;
  if (!scanner?.scanPrivacy) throw new Error("Modul pemindai Android belum terpasang. Build ulang APK terbaru.");
  return scanner.scanPrivacy();
}
