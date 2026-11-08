// Tujuan file: File layar tab aplikasi; menampilkan pembaruan aplikasi.
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { ApiKeyNotice, BrandHeader, Panel, PrimaryButton, ScreenShell, StatusPill, useZraTheme } from "@/components/zra-ui";
import { useAppState } from "@/lib/app-state";

export default function UpdateScreen() {
  const { ZRA, styles } = useZraTheme();
  const { tokenPresent, locationSharing, updateRequired, updateInfo, updateProgress, checkForUpdate, downloadAndInstallUpdate, connectionMessage } = useAppState();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");

  if (!tokenPresent) return <ApiKeyNotice />;

  const check = async () => {
    setChecking(true);
    setNotice("");
    const required = await checkForUpdate();
    setNotice(required ? "Update wajib tersedia." : "Tidak ada update wajib atau desktop tidak dapat dijangkau.");
    setChecking(false);
  };

  const install = async () => {
    setNotice("Mengunduh APK...");
    const opened = await downloadAndInstallUpdate();
    setNotice(opened ? "Installer Android dibuka. Konfirmasi pemasangan untuk mengganti versi lama." : connectionMessage || "Unduhan atau installer gagal dibuka.");
  };

  return (
    <ScreenShell>
      <BrandHeader eyebrow="MOBILE RELEASE" title="Update aplikasi." subtitle="Versi resmi dari Desktop." />
      <Panel accent style={{ gap: 13 }}>
        <StatusPill label={updateRequired ? "UPDATE WAJIB" : "VERSI APLIKASI"} tone={updateRequired ? "amber" : "mint"} />
        <Text style={styles.panelTitle}>{updateInfo ? `Versi ${updateInfo.version}` : updateRequired ? "Pembaruan diperlukan" : "Periksa pembaruan"}</Text>
        <Text style={styles.panelBody}>{updateInfo?.notes || "Desktop dapat mewajibkan versi baru dan menyediakan APK untuk perangkat ini."}</Text>
        {updateInfo ? <Text style={{ color: ZRA.muted, fontSize: 11 }}>Android versionCode {updateInfo.versionCode}</Text> : null}
        {updateProgress !== null ? <View style={{ height: 8, overflow: "hidden", borderRadius: 8, backgroundColor: ZRA.border }}><View style={{ width: `${Math.max(2, Math.min(100, Math.round(updateProgress * 100)))}%`, height: 8, backgroundColor: ZRA.mint }} /></View> : null}
        {notice ? <Text style={{ color: ZRA.muted, fontSize: 12, lineHeight: 18 }}>{notice}</Text> : null}
        {updateRequired || updateInfo ? (
          <PrimaryButton label={updateProgress !== null ? `Mengunduh ${Math.round(updateProgress * 100)}%` : "Unduh & pasang APK"} icon="download-outline" onPress={() => { void install(); }} disabled={updateProgress !== null || Platform.OS !== "android"} />
        ) : null}
        {!updateRequired ? <PrimaryButton label={checking ? "Memeriksa..." : "Periksa update"} icon="refresh-outline" onPress={() => { void check(); }} disabled={checking} /> : null}
        {Platform.OS !== "android" ? <Text style={{ color: ZRA.amber, fontSize: 12 }}>Instalasi APK hanya tersedia di Android.</Text> : null}
      </Panel>
      {updateRequired ? <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 17 }}>Jika Android meminta izin, aktifkan “Izinkan dari sumber ini”. Aplikasi lama diganti saat pemasangan selesai.</Text> : null}
    </ScreenShell>
  );
}
