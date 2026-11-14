// Tujuan file: File layar tab aplikasi; menampilkan ringkasan dan pintasan fitur.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { ApiKeyNotice, BrandHeader, Panel, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { useAppState } from "@/lib/app-state";

export default function OverviewScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, hasDesktopApi, setActiveActivity } = useAppState();

  useEffect(() => {
    setActiveActivity("Membuka Dashboard Ringkasan");
  }, [setActiveActivity]);

  if (!hasDesktopApi) {
    return <ApiKeyNotice locationRequired={false} />;
  }

  const toolCategories = [
    {
      id: "dorking",
      title: "Dorking & Recon",
      subtitle: "Bing Search untuk Halaman Terindeks",
      icon: "search-outline" as const,
      route: "/tools_dorking" as const,
    },
    {
      id: "website",
      title: "Website Pentest",
      subtitle: "Audit & Fuzzing AI Web Target",
      icon: "globe-outline" as const,
      route: "/tools_website" as const,
    },
    {
      id: "phising",
      title: "Phishing Check",
      subtitle: "Deteksi Indikator URL Phishing",
      icon: "shield-checkmark-outline" as const,
      route: "/tools_phising" as const,
    },
    {
      id: "app",
      title: "App Mobile",
      subtitle: "Inspeksi Statis & Izin APK/IPA",
      icon: "phone-portrait-outline" as const,
      route: "/tools_app" as const,
    },
    {
      id: "file",
      title: "File & Artifact",
      subtitle: "Analisis Berkas & Hash Malware",
      icon: "document-text-outline" as const,
      route: "/tools_file" as const,
    },
    {
      id: "osint",
      title: "Recon & OSINT",
      subtitle: "Google Search, Lens & Maps",
      icon: "radio-outline" as const,
      route: "/tools_osint" as const,
    },
    {
      id: "vps",
      title: "VPS & Server Control",
      subtitle: "Monitoring Server & Infrastructure",
      icon: "server-outline" as const,
      route: "/tools_vps" as const,
    },
    {
      id: "crypto",
      title: "Kriptografi & Cipher",
      subtitle: "Audit Enkripsi, Hash & Key",
      icon: "key-outline" as const,
      route: "/tools_cryptography" as const,
    },
  ];

  return (
    <ScreenShell>
      <BrandHeader
        eyebrow="ZRACORE / WORKSPACE"
        title="Ringkasan."
        subtitle="Job dan koneksi desktop."
      />

      <Panel accent style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <StatusPill label="DESKTOP CONNECTED" tone="mint" />
            <Text style={styles.panelTitle}>Control plane aktif</Text>
            <Text style={styles.panelBody} numberOfLines={1} ellipsizeMode="middle">{apiUrl}</Text>
          </View>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="shield-checkmark-outline" size={23} color={ZRA.mint} />
          </View>
        </View>
      </Panel>

      <SectionHeading label="Kategori Toolkit Pentest & Audit" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
        {toolCategories.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => router.push(item.route)}
            style={({ pressed }) => [
              {
                width: "48%",
                padding: 14,
                borderRadius: 16,
                backgroundColor: ZRA.surfaceRaised,
                borderWidth: 1,
                borderColor: ZRA.border,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={item.icon} size={20} color={ZRA.mint} />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ color: ZRA.text, fontSize: 14, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 14 }}>{item.subtitle}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>Buka Tools</Text>
              <Ionicons name="chevron-forward" size={14} color={ZRA.mint} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScreenShell>
  );
}
