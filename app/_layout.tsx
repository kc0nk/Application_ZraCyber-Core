// Tujuan file: Mengatur layout akar, tema, dan navigasi aplikasi.
import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaFrameContext, SafeAreaInsetsContext, SafeAreaProvider, SafeAreaView, initialWindowMetrics } from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppStateProvider, useAppState } from "@/lib/app-state";
import { useZraTheme } from "@/components/zra-ui";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { ThemeProvider } from "@/lib/theme-provider";
import { useThemeContext } from "@/lib/theme-provider";
import "@/lib/_core/nativewind-pressable";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = { anchor: "(tabs)" };

function RoutedContent() {
  const { colorScheme } = useThemeContext();
  const { ZRA } = useZraTheme();
  const { accessBlocked, accessBlockedReason, retryAccessCheck, updateRequired, updateInfo, updateProgress, downloadAndInstallUpdate, connectionMessage, locationSharing, setLocationSharing } = useAppState();
  const setLocationSharingRef = useRef(setLocationSharing);

  useEffect(() => {
    setLocationSharingRef.current = setLocationSharing;
  }, [setLocationSharing]);

  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  const checkPermission = useCallback(async () => {
    try {
      const status = await Location.getForegroundPermissionsAsync();
      const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
      const granted = status.granted && servicesEnabled;
      setLocationGranted(granted);
      if (granted) {
        await AsyncStorage.setItem("zra.location_granted_cache", "true");
        void setLocationSharingRef.current(true);
      } else {
        await AsyncStorage.removeItem("zra.location_granted_cache").catch(() => {});
        void setLocationSharingRef.current(false);
      }
    } catch {
      setLocationGranted(false);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const status = await Location.requestForegroundPermissionsAsync();
      const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
      const granted = status.granted && servicesEnabled;
      setLocationGranted(granted);
      if (granted) {
        await AsyncStorage.setItem("zra.location_granted_cache", "true");
        void setLocationSharingRef.current(true);
      } else {
        void setLocationSharingRef.current(false);
      }
    } catch {
      setLocationGranted(false);
    }
  }, []);

  useEffect(() => {
    void checkPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkPermission();
      }
    });
    return () => subscription.remove();
  }, [checkPermission]);

  if (locationGranted !== true) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: ZRA.background }}>
        <View style={{ padding: 24, borderWidth: 1, borderColor: ZRA.border, borderRadius: 24, backgroundColor: ZRA.surface }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Ionicons name="shield-checkmark-outline" size={32} color={ZRA.mint} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: "800", color: ZRA.mint, marginBottom: 8, letterSpacing: 1.1 }}>IZIN LOKASI DIPERLUKAN</Text>
          <Text style={{ fontSize: 22, fontWeight: "900", color: ZRA.text, marginBottom: 12 }}>Izinkan Lokasi</Text>
          <Text style={{ fontSize: 13, color: ZRA.muted, marginBottom: 20, lineHeight: 18 }}>Izin lokasi diperlukan untuk fitur koordinat perangkat.</Text>
          
          <View style={{ backgroundColor: ZRA.surfaceRaised, padding: 14, borderRadius: 12, gap: 8, marginBottom: 20, borderWidth: 1, borderColor: ZRA.border }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: locationGranted ? ZRA.mint : ZRA.red, marginRight: 10 }} />
              <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "700" }}>{locationGranted ? "Lokasi GPS Diizinkan" : "Lokasi GPS belum diizinkan / dimatikan"}</Text>
            </View>
          </View>

          <Pressable onPress={() => void requestPermission()} style={{ height: 48, backgroundColor: ZRA.button, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Text style={{ color: ZRA.buttonText, fontWeight: "800", fontSize: 14 }}>Minta izin lokasi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (accessBlocked) {
    const reason = accessBlockedReason || "block";

    if (reason === "release") {
      return (
        <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#0b1016" }}>
          <View style={{ gap: 14, padding: 22, borderWidth: 1, borderColor: "#3b82f6", borderRadius: 20, backgroundColor: "#15191e" }}>
            <Text style={{ color: "#93c5fd", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }}>PERANGKAT DILEPAS</Text>
            <Text style={{ color: "#f3f7fa", fontSize: 24, fontWeight: "800" }}>Sesi diakhiri.</Text>
            <Text style={{ color: "#91a0ad", fontSize: 14, lineHeight: 21 }}>Perangkat Anda telah dilepas dari daftar terdaftar oleh administrator desktop. Silakan hubungkan kembali dengan API key baru jika diperlukan.</Text>
            <Pressable onPress={() => void retryAccessCheck()} style={{ minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#93c5fd" }}>
              <Text style={{ color: "#0b1016", fontWeight: "800" }}>Mengerti & Lanjutkan</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    if (reason === "uninstall") {
      return (
        <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#0b1016" }}>
          <View style={{ gap: 14, padding: 22, borderWidth: 1, borderColor: "#ef4444", borderRadius: 20, backgroundColor: "#15191e" }}>
            <Text style={{ color: "#fca5a5", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }}>FORCE UNINSTALL & WIPE</Text>
            <Text style={{ color: "#f3f7fa", fontSize: 24, fontWeight: "800" }}>Aplikasi dicopot paksa.</Text>
            <Text style={{ color: "#91a0ad", fontSize: 14, lineHeight: 21 }}>Administrator desktop memerintahkan pencopotan aplikasi (Force Uninstall / Wipe). Seluruh data lokal dan sesi telah dihapus. Silakan buka pengaturan untuk menghubungkan ulang.</Text>
            <Pressable onPress={() => void retryAccessCheck()} style={{ minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fca5a5" }}>
              <Text style={{ color: "#0b1016", fontWeight: "800" }}>Buka Pengaturan / Profil</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#0b1016" }}>
        <View style={{ gap: 14, padding: 22, borderWidth: 1, borderColor: "#694141", borderRadius: 20, backgroundColor: "#15191e" }}>
          <Text style={{ color: "#ff9c9c", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }}>AKSES DIBLOKIR</Text>
          <Text style={{ color: "#f3f7fa", fontSize: 24, fontWeight: "800" }}>Aplikasi terkunci.</Text>
          <Text style={{ color: "#91a0ad", fontSize: 14, lineHeight: 21 }}>Administrator desktop menonaktifkan/memblokir akses device ini. Hubungi administrator untuk membuka blokir.</Text>
          <Pressable onPress={() => void retryAccessCheck()} style={{ minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#a3f7c5" }}>
            <Text style={{ color: "#0b1016", fontWeight: "800" }}>Cek akses lagi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (updateRequired) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#0b1016" }}>
        <View style={{ gap: 14, padding: 22, borderWidth: 1, borderColor: "#854d0e", borderRadius: 20, backgroundColor: "#15191e" }}>
          <Text style={{ color: "#fde047", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }}>PEMBARUAN APLIKASI WAJIB</Text>
          <Text style={{ color: "#f3f7fa", fontSize: 24, fontWeight: "800" }}>App sudah ada update terbaru.</Text>
          <Text style={{ color: "#91a0ad", fontSize: 14, lineHeight: 21 }}>
            {updateInfo ? `Versi ${updateInfo.version} (${updateInfo.notes || "Pembaruan keamanan sistem"}) telah dirilis. Anda wajib mengunduh dan memasang pembaruan APK ini untuk membuka kunci aplikasi.` : "Administrator desktop mewajibkan pembaruan versi APK terbaru."}
          </Text>
          {updateProgress !== null ? (
            <View style={{ gap: 6 }}>
              <View style={{ height: 8, overflow: "hidden", borderRadius: 8, backgroundColor: "#334155" }}>
                <View style={{ width: `${Math.max(2, Math.min(100, Math.round(updateProgress * 100)))}%`, height: 8, backgroundColor: "#fde047" }} />
              </View>
              <Text style={{ color: "#fde047", fontSize: 12, fontWeight: "700" }}>Mengunduh APK... {Math.round(updateProgress * 100)}%</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => void downloadAndInstallUpdate()}
            disabled={Platform.OS !== "android" || updateProgress !== null}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Platform.OS === "android" && updateProgress === null ? "#fde047" : "#64748b" }}
          >
            <Text style={{ color: "#0b1016", fontSize: 14, fontWeight: "900" }}>
              {Platform.OS === "android" ? (updateProgress !== null ? "Sedang Mengunduh..." : "Unduh & Pasang Update APK") : "Fitur update khusus perangkat Android"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="oauth/callback" />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    return subscribeSafeAreaInsets(handleSafeAreaUpdate);
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const [trpcClient] = useState(() => createTRPCClient());
  const providerInitialMetrics = useMemo(() => ({
    insets: { ...initialInsets, top: Math.max(initialInsets.top, 16), bottom: Math.max(initialInsets.bottom, 12) },
    frame: initialFrame,
  }), [initialFrame, initialInsets]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStateProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <RoutedContent />
          </QueryClientProvider>
        </trpc.Provider>
      </AppStateProvider>
    </GestureHandlerRootView>
  );

  if (Platform.OS === "web") {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return <ThemeProvider><SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider></ThemeProvider>;
}
