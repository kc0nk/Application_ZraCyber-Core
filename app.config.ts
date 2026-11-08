// Tujuan file: Modul TypeScript (app.config) untuk konfigurasi atau tipe aplikasi.
// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.zracore.<project_name_dots>.<timestamp>
const rawBundleId = "space.zracore.app.t193060682331227";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.zracore.app";
// Extract timestamp from bundle ID and prefix with "zracore" for deep link scheme
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `zracore${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "ZraCyber Core",
  appSlug: "zracore",
  // Durable HTTPS project-logo URL used by the managed Webdev metadata.
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519664025748003/oKnIUNdrsGgpdcRI.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

// Expo serializes this browser-safe subset into native and web bundles. The server-only
// MANUS_API_KEY and MANUS_JWT_SECRET must never enter this object.
const publicRuntime = {
  oauthPortalUrl:
    process.env.MANUS_OAUTH_PORTAL_URL ??
    process.env.VITE_OAUTH_PORTAL_URL ??
    process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ??
    "",
  oauthServerUrl:
    process.env.MANUS_OAUTH_API_URL ??
    process.env.OAUTH_SERVER_URL ??
    process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ??
    "",
  appId:
    process.env.MANUS_PROJECT_ID ??
    process.env.VITE_APP_ID ??
    process.env.EXPO_PUBLIC_APP_ID ??
    "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
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
    versionCode: 1,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundColor: "#0D1120",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    permissions: ["POST_NOTIFICATIONS", "REQUEST_INSTALL_PACKAGES", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_WIFI_STATE", "QUERY_ALL_PACKAGES"],
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
    ["expo-location", { locationWhenInUsePermission: "Bagikan lokasi perangkat ke desktop yang terhubung.", isAndroidBackgroundLocationEnabled: false, isIosBackgroundLocationEnabled: false }],
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
