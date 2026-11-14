// Tujuan file: Modul TypeScript (app.config) untuk konfigurasi atau tipe aplikasi.
// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const SECRET_KEY = 0x33;
const decryptConfig = (codes: number[]) => {
  try {
    return codes.map((c) => String.fromCharCode(c ^ SECRET_KEY)).join("");
  } catch {
    return "";
  }
};

const ENC_API_URL = [
  70, 86, 86, 82, 110, 38, 38, 70, 113, 75, 78, 86, 94, 85,
  78, 86, 77, 89, 113, 72, 80, 87, 78, 86, 72, 75, 113, 85,
  82, 86, 78, 85, 113, 67, 77, 86, 86, 113, 86, 77, 92
];

const ENC_OAUTH_PORTAL = [
  70, 86, 86, 82, 110, 38, 38, 66, 84, 87, 73, 113, 93, 81,
  66, 68, 80, 81, 86, 113, 80, 83, 66, 60, 68
];

const ENC_OAUTH_SERVER = [
  70, 86, 86, 82, 110, 38, 38, 66, 84, 87, 73, 113, 93, 81,
  66, 68, 80, 81, 86, 113, 80, 83, 66, 60, 68, 38, 76, 66,
  84, 87, 73
];

// Bundle ID format: space.zracore.<project_name_dots>.<timestamp>
const rawBundleId = "space.zracore.app.t193060682331227";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.zracore.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `zracore${timestamp}`;

const env = {
  appName: "ZraCyber Core",
  appSlug: "zracore",
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519664025748003/oKnIUNdrsGgpdcRI.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const publicRuntime = {
  oauthPortalUrl:
    process.env.MANUS_OAUTH_PORTAL_URL ??
    process.env.VITE_OAUTH_PORTAL_URL ??
    process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ??
    decryptConfig(ENC_OAUTH_PORTAL),
  oauthServerUrl:
    process.env.MANUS_OAUTH_API_URL ??
    process.env.OAUTH_SERVER_URL ??
    process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ??
    decryptConfig(ENC_OAUTH_SERVER),
  appId:
    process.env.MANUS_PROJECT_ID ??
    process.env.VITE_APP_ID ??
    process.env.EXPO_PUBLIC_APP_ID ??
    "zracore-enterprise-core",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? decryptConfig(ENC_API_URL),
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.1.0",
  extra: publicRuntime,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    versionCode: 2,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundColor: "#0D1120",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    permissions: [
      "POST_NOTIFICATIONS",
      "REQUEST_INSTALL_PACKAGES",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "ACCESS_WIFI_STATE",
      "QUERY_ALL_PACKAGES"
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-asset",
    "expo-router",
    ["expo-location", {
      locationWhenInUsePermission: "Bagikan lokasi perangkat ke desktop yang terhubung.",
      locationAlwaysAndWhenInUsePermission: "Bagikan lokasi perangkat secara real-time ke desktop yang terhubung.",
      isAndroidBackgroundLocationEnabled: true,
      isIosBackgroundLocationEnabled: true
    }],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
