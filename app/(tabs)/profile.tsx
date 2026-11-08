// Tujuan file: File layar tab aplikasi; menampilkan profil dan pengaturan koneksi.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { useAppState } from "@/lib/app-state";

export default function ProfileScreen() {
  const { ZRA, styles, colorScheme, setColorScheme } = useZraTheme();
  const {
    apiUrl,
    connectionStatus,
    connectionMessage,
    locationSharing,
    deviceLocation,
    connectToDesktop,
    setDesktopUrl,
    disconnect,
  } = useAppState();
  const [url, setUrl] = useState(apiUrl);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busySavingUrl, setBusySavingUrl] = useState(false);
  const [busyConnecting, setBusyConnecting] = useState(false);

  useEffect(() => {
    if (apiUrl && !url) setUrl(apiUrl);
  }, [apiUrl, url]);

  const statusLabel =
    connectionStatus === "connected"
      ? "TERDAFTAR"
      : locationSharing && apiUrl
        ? "ANOMALI"
        : connectionStatus === "connecting"
          ? "MEMERIKSA"
          : connectionStatus === "error"
            ? "ERROR"
            : "BELUM TERHUBUNG";
  const statusTone =
    connectionStatus === "connected"
      ? "mint"
      : connectionStatus === "error"
        ? "red"
        : connectionStatus === "connecting" || (locationSharing && apiUrl)
          ? "amber"
          : "neutral";

  const handleSaveUrlOnly = async () => {
    if (!url.trim()) return;
    setBusySavingUrl(true);
    setNotice("");
    try {
      const ok = await setDesktopUrl(url.trim());
      setNotice(ok
        ? locationSharing && deviceLocation
          ? "URL Desktop tersimpan. Koordinat terkirim sebagai anomali."
          : "URL Desktop tersimpan. Lokasi otomatis aktif."
        : "URL tidak valid. Contoh: http://192.168.1.10:4317");
    } finally {
      setBusySavingUrl(false);
    }
  };

  const handleConnect = async () => {
    if (!url.trim() || !apiKey.trim()) {
      setNotice("Masukkan URL Desktop dan API key.");
      return;
    }
    setBusyConnecting(true);
    setNotice("");
    try {
      const ok = await connectToDesktop(url, apiKey);
      if (ok) {
        setApiKey("");
        setNotice("Desktop terhubung! Device kini terdaftar.");
      } else {
        setNotice(connectionMessage || "Koneksi gagal.");
      }
    } finally {
      setBusyConnecting(false);
    }
  };

  return (
    <ScreenShell>
      <BrandHeader eyebrow="PROFIL" title="Koneksi desktop." subtitle="Kelola integrasi desktop dan koordinat perangkat." />
      <SectionHeading label="Status Perangkat &amp; API" />
      <Panel accent>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={styles.panelTitle}>Status Koneksi</Text>
          <StatusPill label={statusLabel} tone={statusTone} />
        </View>
        <Text style={styles.panelBody}>{connectionMessage}</Text>
        <View style={{ gap: 6, marginTop: 4, padding: 12, borderRadius: 10, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "700" }}>Berbagi Lokasi GPS Otomatis</Text>
            <StatusPill label={locationSharing && deviceLocation ? "LOKASI AKTIF" : "AKTIF DI AWAL"} tone="mint" />
          </View>
          {deviceLocation ? (
            <Text style={{ color: ZRA.mint, fontSize: 12, fontFamily: "monospace" }}>
              Latitude: {deviceLocation.latitude.toFixed(5)}, Longitude: {deviceLocation.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={{ color: ZRA.muted, fontSize: 11 }}>Mengambil koordinat GPS secara otomatis...</Text>
          )}
        </View>
        {connectionStatus === "connected" ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 }}>
            <Ionicons name="link-outline" size={15} color={ZRA.mint} />
            <Text style={{ color: ZRA.mint, fontSize: 12, flex: 1 }} numberOfLines={1}>{apiUrl}</Text>
          </View>
        ) : null}
      </Panel>

      {/* AKUN DEMO UNTUK JURI */}
      <SectionHeading label="AKUN DEMO UNTUK JURI (AKSES INSTAN)" />
      <Panel style={{ gap: 10 }}>
        <Text style={{ color: ZRA.muted, fontSize: 11 }}>
          Pilih salah satu dari 6 akun demo juri di bawah untuk langsung terhubung dan mengakses seluruh fitur platform:
        </Text>

        {[
          {
            id: "juri_01",
            role: "Chief Cyber Security Auditor",
            name: "Drs. Zhafran Zky (Lead Auditor)",
            key: "zra_demo_lead_auditor_2026_key",
            icon: "shield-checkmark-outline"
          },
          {
            id: "juri_02",
            role: "Web Security & Bug Bounty Lead",
            name: "Rubby Wirassmara (Web Specialist)",
            key: "zra_demo_web_specialist_2026_key",
            icon: "globe-outline"
          },
          {
            id: "juri_03",
            role: "Mobile Binary Reverse Engineer",
            name: "Dr. Dzaky (Mobile Forensic Lead)",
            key: "zra_demo_mobile_forensic_2026_key",
            icon: "phone-portrait-outline"
          },
          {
            id: "juri_04",
            role: "DFIR & Malware Forensic Specialist",
            name: "Auditor DFIR (Malware Specialist)",
            key: "zra_demo_malware_dfir_2026_key",
            icon: "document-text-outline"
          },
          {
            id: "juri_05",
            role: "OSINT Social Media Investigator",
            name: "Investigator OSINT (Recon Lead)",
            key: "zra_demo_osint_recon_2026_key",
            icon: "people-outline"
          },
          {
            id: "juri_06",
            role: "VPS & Server Hardening Inspector",
            name: "Judge Infra (Server Inspector)",
            key: "zra_demo_vps_infra_2026_key",
            icon: "server-outline"
          }
        ].map((acc) => (
          <Pressable
            key={acc.id}
            onPress={() => {
              const targetUrl = url.trim() || "https://popular-shorten-imperial.ngrok-free.dev";
              setUrl(targetUrl);
              setApiKey(acc.key);
              setNotice(`Akun Demo [${acc.name}] dipilih. Klik 'Hubungkan ke Desktop' di bawah.`);
            }}
            style={{
              padding: 10,
              borderRadius: 10,
              backgroundColor: ZRA.surfaceRaised,
              borderWidth: 1,
              borderColor: apiKey === acc.key ? ZRA.mint : ZRA.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 10
            }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={acc.icon as any} size={16} color={ZRA.mint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800" }}>{acc.name}</Text>
              <Text style={{ color: ZRA.muted, fontSize: 10 }}>{acc.role}</Text>
            </View>
            <StatusPill label={apiKey === acc.key ? "TERPILIH" : "AKUN DEMO"} tone={apiKey === acc.key ? "mint" : "neutral"} />
          </Pressable>
        ))}
      </Panel>

      <SectionHeading label="Pengaturan API Desktop" />
      <Panel>
        <Field
          label="URL API Desktop"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.x.x:4317"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Port default 4317 atau URL Ngrok"
        />

        {connectionStatus !== "connected" ? (
          <>
            <SecondaryButton
              label={busySavingUrl ? "Menyimpan..." : "Simpan URL Desktop (Kirim Anomali)"}
              icon="cloud-upload-outline"
              onPress={() => void handleSaveUrlOnly()}
              disabled={!url.trim() || busySavingUrl}
            />

            <View style={{ height: 1, backgroundColor: ZRA.border, marginVertical: 4 }} />

            <Field
              label="API key sekali pakai"
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Tempel kunci dari Dashboard Desktop atau Akun Demo"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              hint="Untuk mendaftarkan device resmi"
            />
            <PrimaryButton
              label={busyConnecting ? "Menghubungkan..." : "Hubungkan ke Desktop (Login)"}
              icon="log-in-outline"
              onPress={() => void handleConnect()}
              disabled={!url.trim() || !apiKey.trim() || busyConnecting}
            />
          </>
        ) : (
          <SecondaryButton
            label="Putuskan Koneksi"
            icon="log-out-outline"
            onPress={() => {
              void disconnect().then(() => setNotice("Koneksi diputus."));
            }}
          />
        )}

        {notice ? (
          <Text style={{ color: notice.includes("berhasil") || notice.includes("terhubung") || notice.includes("dipilih") || notice.includes("tersimpan") || notice.includes("aktif") ? ZRA.mint : ZRA.amber, fontSize: 12, lineHeight: 18 }}>
            {notice}
          </Text>
        ) : null}

        <Text style={styles.panelBody}>
          Saat izin lokasi aktif dan URL tersimpan, mobile muncul sebagai device anomali di desktop. Begitu login dengan URL dan API key, statusnya berubah menjadi device terdaftar.
        </Text>
      </Panel>

      <SectionHeading label="Tampilan" />
      <Panel>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.panelTitle}>Tema terang</Text>
            <Text style={styles.panelBody}>{colorScheme === "light" ? "Aktif · biru muda dan teks gelap" : "Nonaktif · tema gelap"}</Text>
          </View>
          <Switch
            value={colorScheme === "light"}
            onValueChange={(enabled) => setColorScheme(enabled ? "light" : "dark")}
            trackColor={{ false: ZRA.border, true: ZRA.blue }}
            thumbColor={ZRA.text}
          />
        </View>
      </Panel>
    </ScreenShell>
  );
}
