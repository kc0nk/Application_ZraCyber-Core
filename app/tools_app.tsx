// Tujuan file: File layar tool app; berisi input, kontrol, dan hasil yang terlihat bagi pengguna.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

// ============================================================================
// APP SCAN LIMITS
// ============================================================================
const MAX_APP_SAMPLE_BYTES = 200 * 1024 * 1024;

// ============================================================================
// APP SCAN SCREEN
// ============================================================================
export default function ToolsAppScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, tokenPresent, history, addHistory, clearHistory } = useAppState();

  // ============================================================================
  // SCREEN STATE
  // ============================================================================
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reportData, setReportData] = useState<any | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    "[READY] App static inspection backend ready.",
    "[IDLE] Menunggu unggahan artefak APK, IPA, atau EXE...",
  ]);
  const appHistory = filterAuditHistory(history, "app");
  const activeStats = reportData?.stats || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  // ============================================================================
  // FILE PICKER
  // ============================================================================
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const extension = asset.name.split(".").pop()?.toLowerCase();
      if (!extension || !["apk", "ipa", "exe"].includes(extension)) {
        setFeedback("Format tidak didukung. Pilih file APK, IPA, atau EXE.");
        return;
      }
      if (!asset.size || asset.size > MAX_APP_SAMPLE_BYTES) {
        setFeedback("Ukuran file harus diketahui dan tidak boleh lebih dari 200 MiB.");
        return;
      }
      setSelectedFile(asset);
      setReportData(null);
      setFeedback("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Gagal memilih file.");
    }
  };

  // ============================================================================
  // DESKTOP STATIC SCAN (REAL BACKEND UPLOAD)
  // ============================================================================
  const handleRunScan = async () => {
    if (!selectedFile) return;
    const fileSize = selectedFile.size || 0;

    setBusy(true);
    setReportData(null);
    setFeedback("Mengunggah artefak ke Desktop Scanner...");
    setScanProgress(25);
    setScanPhase("Uploading binary to Desktop Controller...");
    setTerminalLogs([
      `[START] Memulai inspeksi statis biner: ${selectedFile.name}`,
      `[INFO] Ukuran berkas: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
      `[UPLOAD] Mengirimkan file ke ${apiUrl}/tools/app/scan...`
    ]);

    try {
      const targetUrl = apiUrl || "http://127.0.0.1:4317";
      const uploadResult = await FileSystem.uploadAsync(`${targetUrl}/tools/app/scan`, selectedFile.uri, {
        headers: {
          "Accept": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...websiteAuditHeaders,
        },
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
      });

      setScanProgress(85);
      setScanPhase("Memproses analisis biner backend...");

      if (uploadResult.status !== 200) {
        let errBody;
        try {
          errBody = JSON.parse(uploadResult.body);
        } catch {}
        throw new Error(errBody?.error || `Desktop Controller mengembalikan HTTP ${uploadResult.status}.`);
      }

      const report = JSON.parse(uploadResult.body);
      setReportData(report);
      setScanProgress(100);
      setScanPhase("Analisis biner selesai.");
      setFeedback(`Inspeksi ${selectedFile.name} selesai: ${report.stats?.total || 0} temuan.`);
      setTerminalLogs(Array.isArray(report.logs) ? report.logs : ["[DONE] Analisis biner statis selesai."]);

      addHistory({
        kind: "SCAN",
        title: `App audit: ${selectedFile.name}`,
        subtitle: `Static Analysis · ${report.stats?.total || 0} temuan`,
        status: "completed",
        payload: { action: "scan_app_deep" },
        result: report,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Inspeksi biner gagal.";
      setFeedback(`Gagal menjalankan analisis: ${message}`);
      setTerminalLogs((current) => [...current, `[ERROR] ${message}`]);
    } finally {
      setBusy(false);
      setTimeout(() => setScanProgress(null), 3000);
    }
  };


  // ============================================================================
  // APP SCAN SCREEN UI
  // ============================================================================
  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25, gap: 16 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        >
          <Ionicons name="arrow-back" size={20} color={ZRA.mint} />
          <Text style={{ color: ZRA.mint, fontSize: 13, fontWeight: "700" }}>Kembali ke Ringkasan</Text>
        </Pressable>

        <BrandHeader
          eyebrow="ZRACORE / TOOLKIT"
          title="App Mobile Audit."
          subtitle="Inspeksi statis biner APK, IPA, dan EXE berbasis standar OWASP MASTG &amp; MASVS."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="phone-portrait-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>APP MOBILE AUDIT</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>MASTG · Biner Statis</Text>
              </View>
            </View>
            <StatusPill label="LLM" tone="mint" />
          </View>
        </Panel>

        {/* Pemilihan file sampel APK/IPA/EXE */}
        <SectionHeading label="Unggah Artefak Aplikasi" />
        <Panel style={{ gap: 12 }}>
          <SecondaryButton
            label={selectedFile ? `File: ${selectedFile.name}` : "Pilih File APK, IPA, atau EXE"}
            icon="document-attach-outline"
            onPress={() => void handlePickFile()}
          />

          <PrimaryButton
            label={busy ? "Menganalisis Biner..." : "Mulai Inspeksi Biner"}
            icon="terminal-outline"
            onPress={() => void handleRunScan()}
            disabled={busy || !selectedFile}
          />

          {feedback ? (
            <Text style={{ color: feedback.includes("selesai") || feedback.includes("berhasil") ? ZRA.mint : ZRA.amber, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
              {feedback}
            </Text>
          ) : null}
        </Panel>

        {scanProgress !== null ? (
          <Panel style={{ gap: 8, backgroundColor: ZRA.surfaceRaised }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800" }}>{scanPhase}</Text>
              <Text style={{ color: ZRA.mint, fontSize: 12, fontWeight: "800" }}>{scanProgress}%</Text>
            </View>
            <View style={{ height: 6, overflow: "hidden", borderRadius: 6, backgroundColor: ZRA.border }}>
              <View style={{ width: `${scanProgress}%`, height: 6, backgroundColor: ZRA.mint }} />
            </View>
          </Panel>
        ) : null}

        {/* Konsol Terminal Eksekusi AI */}
        <SectionHeading label="Konsol Terminal Analisis Biner" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE APP AUDIT CONSOLE
              </Text>
            </View>
            <StatusPill label={busy ? "ANALYZING..." : "TERMINAL IDLE"} tone={busy ? "amber" : "mint"} />
          </View>

          <View style={{ backgroundColor: "#000000", padding: 12, borderRadius: 8, gap: 4 }}>
            {terminalLogs.map((line, lIdx) => (
              <Text
                key={lIdx}
                selectable
                style={{
                  color: line.includes("SUCCESS") ? ZRA.mint : line.includes("AI-LLM") ? ZRA.amber : line.includes("INIT") ? ZRA.blue : "#34d399",
                  fontSize: 10,
                  fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                  lineHeight: 15,
                }}
              >
                {line}
              </Text>
            ))}
            {busy ? (
              <Text style={{ color: ZRA.mint, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt; Binary parsing & MASTG compliance analysis in progress... _
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* Hasil/Output */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          {reportData && reportData.vulnerabilities ? (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
              <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>{"// HASIL ANALISIS BINER APK/IPA"}</Text>
              <Text style={{ color: ZRA.muted, fontSize: 11 }}>{reportData.summary}</Text>
              {reportData.vulnerabilities.map((item: any, idx: number) => (
                <View key={idx} style={{ padding: 10, borderRadius: 8, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.border, gap: 6, marginTop: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800", flex: 1 }}>{idx + 1}. {item.title || item.check}</Text>
                    <StatusPill label={item.severity || "High"} tone={item.severity === "Critical" ? "red" : "amber"} />
                  </View>
                  <MarkdownRenderer content={item.summary || item.detail || ""} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
              Belum ada hasil audit biner. Silakan pilih file dan jalankan inspeksi.
            </Text>
          )}
        </Panel>

        {/* Riwayat */}
        <SectionHeading label="RIWAYAT AUDIT APP" />
        <AuditHistoryList items={appHistory} emptyMessage="Belum ada riwayat audit app." clearLabel="Hapus Riwayat App" onClear={() => clearHistory("app")} />
      </ScrollView>
    </ScreenShell>
  );
}
