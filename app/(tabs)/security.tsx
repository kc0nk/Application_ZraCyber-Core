// Tujuan file: Menampilkan pemeriksaan privasi metadata aplikasi di perangkat Android ini.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import {
  AuditHistoryList,
  filterAuditHistory,
} from "@/components/audit-history";
import {
  ApiKeyNotice,
  BrandHeader,
  Panel,
  PrimaryButton,
  ScreenShell,
  SectionHeading,
  StatusPill,
  useZraTheme,
} from "@/components/zra-ui";
import { useAppState } from "@/lib/app-state";
import {
  scanLocalDevicePrivacy,
  type DevicePrivacySnapshot,
} from "@/lib/device-privacy-scan";

type PrivacyRow = {
  check: string;
  status: string;
  detail: string;
  preview: string;
  tone: "amber" | "mint";
};

function makePrivacyRows(snapshot: DevicePrivacySnapshot): PrivacyRow[] {
  const rows: PrivacyRow[] = [];
  const apps = snapshot.appsWithSensitivePermissions;
  const cameraMic = apps.filter(
    (app) => app.cameraGranted || app.microphoneGranted,
  );
  const accessibility = snapshot.activeAccessibilityServices;
  const listeners = snapshot.activeNotificationListeners;
  const admins = snapshot.activeDeviceAdmins;

  rows.push({
    check: "Izin kamera dan mikrofon",
    status: cameraMic.length
      ? `${cameraMic.length} APLIKASI`
      : "TIDAK ADA IZIN AKTIF",
    preview: cameraMic.length
      ? `${cameraMic.length} aplikasi memiliki setidaknya satu izin aktif. Ketuk untuk melihat daftarnya.`
      : "Tidak ada izin kamera/mikrofon aktif yang terdaftar.",
    detail: cameraMic.length
      ? cameraMic
          .map(
            (app) =>
              `${app.appName} (${app.packageName}) — ${[app.microphoneGranted && "mikrofon", app.cameraGranted && "kamera"].filter(Boolean).join(" dan ")}${app.isSystemApp ? "; aplikasi sistem" : "; aplikasi pengguna"}`,
          )
          .join("\n")
      : "Tidak ditemukan aplikasi lain yang saat ini diberi izin kamera atau mikrofon.",
    tone: cameraMic.length ? "amber" : "mint",
  });
  rows.push({
    check: "Layanan Accessibility aktif",
    status: accessibility.length
      ? `${accessibility.length} LAYANAN`
      : "TIDAK ADA",
    preview: accessibility.length
      ? `${accessibility.length} layanan aktif. Ketuk untuk melihat detail.`
      : "Tidak ada layanan aktif.",
    detail: accessibility.length
      ? accessibility
          .map(
            (entry) =>
              `${entry.appName} (${entry.packageName}) · ${entry.serviceName}`,
          )
          .join("\n")
      : "Tidak ada layanan Accessibility pihak ketiga yang tercatat aktif.",
    tone: accessibility.length ? "amber" : "mint",
  });
  rows.push({
    check: "Notification listener aktif",
    status: listeners.length ? `${listeners.length} LAYANAN` : "TIDAK ADA",
    preview: listeners.length
      ? `${listeners.length} layanan aktif. Ketuk untuk melihat detail.`
      : "Tidak ada layanan aktif.",
    detail: listeners.length
      ? listeners
          .map(
            (entry) =>
              `${entry.appName} (${entry.packageName}) · ${entry.serviceName}`,
          )
          .join("\n")
      : "Tidak ada notification listener yang tercatat aktif.",
    tone: listeners.length ? "amber" : "mint",
  });
  rows.push({
    check: "Device admin aktif",
    status: admins.length ? `${admins.length} APLIKASI` : "TIDAK ADA",
    preview: admins.length
      ? `${admins.length} aplikasi aktif. Ketuk untuk melihat detail.`
      : "Tidak ada admin aktif.",
    detail: admins.length
      ? admins
          .map(
            (entry) =>
              `${entry.appName} (${entry.packageName}) · ${entry.serviceName}`,
          )
          .join("\n")
      : "Tidak ada administrator perangkat yang tercatat aktif.",
    tone: admins.length ? "amber" : "mint",
  });
  return rows;
}

export default function SecurityScreen() {
  const { ZRA } = useZraTheme();
  const { hasDesktopApi, addHistory, history, clearHistory } = useAppState();

  if (!hasDesktopApi) {
    return <ApiKeyNotice locationRequired={false} />;
  }
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [scanResults, setScanResults] = useState<PrivacyRow[] | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[READY] Pemeriksaan metadata privasi Android siap.",
    "[IDLE] Hasil dibaca lokal dari perangkat ini; tidak memerlukan Desktop.",
  ]);
  const securityHistory = filterAuditHistory(history, "security");

  const handleRunDeviceScan = async () => {
    setBusy(true);
    setFeedback("");
    setScanResults(null);
    setExpandedResult(null);
    setTerminalLogs([
      "[INIT] Memulai inventaris paket dan izin privasi Android...",
    ]);
    try {
      const snapshot = await scanLocalDevicePrivacy();
      const findings = makePrivacyRows(snapshot);
      setScanResults(findings);
      setTerminalLogs([
        `[DONE] Paket aplikasi terpasang: ${snapshot.installedPackageCount}.`,
        `[DONE] Aplikasi yang meminta izin kamera/mikrofon: ${snapshot.appsWithSensitivePermissions.length}.`,
        `[DONE] Accessibility: ${snapshot.activeAccessibilityServices.length} · Notification listener: ${snapshot.activeNotificationListeners.length} · Device admin: ${snapshot.activeDeviceAdmins.length}.`,
        "[INFO] Pemeriksaan metadata selesai. Tidak ada APK yang dibongkar atau dicocokkan dengan signature malware.",
      ]);
      setFeedback("Pemeriksaan privasi lokal selesai.");
      addHistory({
        kind: "SCAN",
        title: "Pemeriksaan Privasi Perangkat Android",
        subtitle: `${snapshot.installedPackageCount} paket · ${new Date().toLocaleString()}`,
        status: "completed",
        payload: { action: "device_security_scan" },
        result: {
          summary:
            "Pemeriksaan lokal membaca metadata paket, izin kamera/mikrofon, dan akses sensitif yang aktif.",
          output:
            "Izin dan akses yang terdaftar perlu ditinjau sesuai kebutuhan aplikasi. Ini bukan bukti perekaman atau deteksi malware.",
          deviceScan: snapshot,
          findings: findings.map((row) => ({
            check: row.check,
            severity:
              row.tone === "amber" ? ("medium" as const) : ("info" as const),
            status: row.status,
            detail: row.detail,
            recommendation:
              "Tinjau dari Pengaturan Android dan cabut izin/akses yang tidak Anda kenali atau tidak dibutuhkan.",
          })),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Pemeriksaan perangkat gagal.";
      setFeedback(message);
      setTerminalLogs([`[ERROR] ${message}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <BrandHeader
        eyebrow="ZRACORE / DEVICE SECURITY"
        title="Security."
        subtitle="Tinjau izin kamera/mikrofon dan akses sensitif aplikasi di perangkat ini."
      />

      <Panel
        accent
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 16,
        }}
      >
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: busy ? ZRA.surfaceRaised : ZRA.mintDim,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: busy ? ZRA.amber : ZRA.mint,
          }}
        >
          <Ionicons
            name={busy ? "sync-outline" : "shield-checkmark-outline"}
            size={28}
            color={busy ? ZRA.amber : ZRA.mint}
          />
        </View>
        <View style={{ flex: 1, alignItems: "flex-start", gap: 5 }}>
          <Text style={{ color: ZRA.text, fontSize: 14, fontWeight: "900" }}>
            {busy ? "Memeriksa perangkat…" : "Pemeriksaan privasi"}
          </Text>
          <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>
            Berjalan lokal di Android, tanpa koneksi Desktop.
          </Text>
          <StatusPill
            label={busy ? "MEMERIKSA" : "PEMINDAI LOKAL"}
            tone={busy ? "amber" : "mint"}
          />
        </View>
      </Panel>

      <SectionHeading label="PEMERIKSAAN LOKAL" />
      <Panel style={{ gap: 12 }}>
        <PrimaryButton
          label={busy ? "Memeriksa…" : "Periksa Izin & Akses Aplikasi"}
          icon="scan-outline"
          onPress={() => void handleRunDeviceScan()}
          disabled={busy || Platform.OS !== "android"}
        />
        {Platform.OS !== "android" ? (
          <Text style={{ color: ZRA.amber, fontSize: 11, textAlign: "center" }}>
            Pemindaian lokal hanya tersedia pada build Android.
          </Text>
        ) : null}
        {feedback ? (
          <Text
            style={{
              color: feedback.startsWith("Pemeriksaan") ? ZRA.mint : ZRA.amber,
              fontSize: 11,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            {feedback}
          </Text>
        ) : null}
      </Panel>

      <SectionHeading label="CATATAN PEMERIKSAAN" />
      <Panel
        style={{
          gap: 8,
          backgroundColor: "#060a0f",
          borderColor: ZRA.mint,
          borderWidth: 1,
        }}
      >
        {terminalLogs.map((line, index) => (
          <Text
            key={`${index}-${line}`}
            selectable
            style={{
              color: line.startsWith("[ERROR]") ? "#fca5a5" : "#34d399",
              fontSize: 10,
              lineHeight: 15,
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
            }}
          >
            {line}
          </Text>
        ))}
        {busy ? (
          <Text
            style={{
              color: ZRA.mint,
              fontSize: 10,
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
            }}
          >
            › Membaca informasi paket Android…
          </Text>
        ) : null}
      </Panel>

      <Panel style={{ gap: 12, backgroundColor: ZRA.surfaceRaised }}>
        <SectionHeading label="HASIL PEMERIKSAAN" />
        {scanResults ? (
          scanResults.map((row, index) => {
            const expanded = expandedResult === row.check;
            return (
              <Pressable
                key={row.check}
                onPress={() => setExpandedResult(expanded ? null : row.check)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: ZRA.surface,
                  borderWidth: 1,
                  borderColor: expanded ? ZRA.mint : ZRA.border,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      color: ZRA.text,
                      fontSize: 12,
                      fontWeight: "800",
                      flex: 1,
                    }}
                  >
                    {index + 1}. {row.check}
                  </Text>
                  <StatusPill label={row.status} tone={row.tone} />
                </View>
                <Text
                  style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}
                >
                  {expanded ? row.detail : row.preview}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    alignSelf: "flex-end",
                  }}
                >
                  <Text
                    style={{ color: ZRA.blue, fontSize: 9, fontWeight: "700" }}
                  >
                    {expanded ? "Tutup detail" : "Lihat detail"}
                  </Text>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={13}
                    color={ZRA.blue}
                  />
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text
            style={{
              color: ZRA.muted,
              fontSize: 11,
              fontStyle: "italic",
              textAlign: "center",
              paddingVertical: 12,
            }}
          >
            Belum ada hasil. Tekan tombol pemeriksaan untuk membaca metadata
            perangkat.
          </Text>
        )}
        <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>
          Pemeriksaan ini tidak membaca isi APK, tidak mengamati perekaman
          aktif, dan tidak mendeteksi semua virus. Izin yang aktif bukan bukti
          aplikasi sedang merekam.
        </Text>
      </Panel>

      <SectionHeading label="RIWAYAT PEMINDAIAN SECURITY" />
      <AuditHistoryList
        items={securityHistory}
        emptyMessage="Belum ada riwayat pemeriksaan perangkat."
        clearLabel="Hapus Riwayat Security"
        onClear={() => clearHistory("security")}
      />
    </ScreenShell>
  );
}
