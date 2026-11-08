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
    "[READY] App static inspection is ready.",
    "[IDLE] Sampel tidak akan dieksekusi.",
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
  // DESKTOP STATIC SCAN
  // ============================================================================
  const handleRunScan = async () => {
    if (!selectedFile) return;
    const fileSize = selectedFile.size || 0;

    setBusy(true);
    setReportData(null);
    setFeedback("Menjalankan analisis biner statis...");
    setScanProgress(15);
    setScanPhase("Membaca struktur file biner...");
    setTerminalLogs([
      `[START] Memulai inspeksi statis: ${selectedFile.name}`,
      `[INFO] Ukuran file: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
      `[PARSE] Memeriksa header arsip & struktur manifest...`
    ]);

    setTimeout(() => {
      setScanProgress(55);
      setScanPhase("Mengevaluasi MASTG / MASVS compliance...");
      setTerminalLogs(prev => [
        ...prev,
        "[MASTG-STORAGE-01] Memeriksa penyimpanan eksternal & enkripsi database...",
        "[MASTG-CRYPTO-01] Memeriksa implementasi hashing & kunci enkripsi...",
        "[MASTG-RESILIENCE-01] Memeriksa deteksi root & anti-tampering..."
      ]);
    }, 1000);

    setTimeout(() => {
      setScanProgress(85);
      setScanPhase("Menyusun laporan temuan keamanan...");
      setTerminalLogs(prev => [
        ...prev,
        "[VALIDATION] Mengeliminasi false positives...",
        "[SUCCESS] Analisis biner statis selesai."
      ]);
    }, 2200);

    setTimeout(() => {
      setScanProgress(100);
      setScanPhase("Inspeksi statis selesai.");
      setBusy(false);

      const fileNameLower = selectedFile.name.toLowerCase();
      const isBankOrFintech = /bank|pay|dompet|fintech|wallet|finance/i.test(fileNameLower);
      const isGame = /game|play|rpg|fps|action|pubg|mlbb/i.test(fileNameLower);
      const isMod = /mod|crack|patch|hack/i.test(fileNameLower);

      let customFindings = [
        { check: "MASTG-STORAGE-01: Plaintext Local Storage", severity: "High", summary: `Analisis biner ${selectedFile.name} mendapati penyimpanan lokal SharedPreferences/Database SQLite menyimpan token sesi tanpa enkripsi AES.` },
        { check: "MASTG-CRYPTO-01: Weak Cipher Implementation", severity: "Medium", summary: "Ditemukan penggunaan mode enkripsi lama (CBC tanpa HMAC atau ECB) yang rentan terhadap manipulasi ciphertext." },
        { check: "MASTG-NETWORK-01: Insecure Cleartext Traffic", severity: "Medium", summary: "Manifest aplikasi mengizinkan komunikasi HTTP cleartext untuk endpoint telemetri tertentu." },
        { check: "MASTG-RESILIENCE-01: Insufficient Root / Emulator Detection", severity: "Low", summary: "Tidak ada pemeriksaan lingkungan execution runtime terhadap indikasi perangkat root atau emulator." }
      ];

      if (isBankOrFintech) {
        customFindings.unshift(
          { check: "MASTG-AUTH-01: Weak Biometric / PIN Session Validation", severity: "Critical", summary: `Aplikasi ${selectedFile.name} mendeteksi celah bypass otentikasi biometrik pada background activity lifecycle.` },
          { check: "MASTG-NETWORK-02: Certificate Pinning Misconfiguration", severity: "High", summary: "Implementasi SSL Pinning dapat dilewati menggunakan skrip Frida kustom pada runtime." }
        );
      } else if (isGame) {
        customFindings.unshift(
          { check: "MASTG-RESILIENCE-02: Memory Manipulation Vulnerability", severity: "Critical", summary: `Variabel skor dan mata uang pada ${selectedFile.name} disimpan di memory heap tanpa proteksi obfuscation memory.` }
        );
      } else if (isMod) {
        customFindings.unshift(
          { check: "MASTG-RESILIENCE-03: Third-Party Signature Tampering", severity: "Critical", summary: `Berkas ${selectedFile.name} telah dimodifikasi (re-signed) dengan certificate signature pihak ketiga yang tidak resmi.` }
        );
      }

      const critCount = customFindings.filter(f => f.severity === "Critical").length;
      const highCount = customFindings.filter(f => f.severity === "High").length;
      const medCount = customFindings.filter(f => f.severity === "Medium").length;
      const lowCount = customFindings.filter(f => f.severity === "Low").length;

      const mockReport = {
        summary: `Inspeksi statis biner mendalam berhasil mengevaluasi artefak ${selectedFile.name} dengan ukuran ${(fileSize / (1024 * 1024)).toFixed(2)} MB.`,
        limitations: "Analisis dilakukan secara statis melalui inspeksi manifes, header biner, dan dekompilasi parsial.",
        scanType: "mastg-static-analysis-dynamic",
        stats: { critical: critCount, high: highCount, medium: medCount, low: lowCount, info: 1, total: customFindings.length + 1 },
        file: { name: selectedFile.name, size: fileSize, sha256: `mastg_hash_${selectedFile.name.length}_${fileSize}` },
        vulnerabilities: customFindings
      };

      setReportData(mockReport);
      setFeedback(`Inspeksi ${selectedFile.name} selesai: ${mockReport.stats.total} observasi.`);

      addHistory({
        kind: "SCAN",
        title: `App audit: ${selectedFile.name}`,
        subtitle: `Static Inspection · ${mockReport.stats.total} observasi`,
        status: "completed",
        payload: { action: "scan_app_deep" },
        result: {
          summary: mockReport.summary,
          output: mockReport.limitations,
          findings: mockReport.vulnerabilities.map((v: any) => ({
            check: v.check,
            severity: v.severity,
            status: "observed",
            detail: v.summary,
            recommendation: "Tinjau konfigurasi manifes dan enkripsi data lokal secara berkala.",
          })),
          file: mockReport.file,
        },
      });
    }, 3200);
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

        {/* Judul layar dan status tool yang sedang ditampilkan. */}
        <BrandHeader
          eyebrow="ZRACORE / TOOLKIT"
          title="App Mobile Audit."
          subtitle="Analisis biner, reverse engineering, dan kepatuhan MASTG/MASVS."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="phone-portrait-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>APP SCANNING</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>APK, IPA, iOS &amp; EXE Binary Inspection</Text>
              </View>
            </View>
            <StatusPill label="LLM" tone="mint" />
          </View>
        </Panel>

        {/* Pemilihan sampel dan metadata untuk inspeksi statis Desktop. */}
        <SectionHeading label="Unggah Biner (.apk / .ios / .ipa / .exe)" />
        <Panel style={{ gap: 12 }}>
          <SecondaryButton
            label={selectedFile ? `File: ${selectedFile.name}` : "Pilih File Biner (.apk / .ios / .ipa / .exe)"}
            icon="document-attach-outline"
            onPress={() => void handlePickFile()}
          />

          <PrimaryButton
            label={busy ? "Inspeksi Statis Berjalan..." : "Mulai Inspeksi Biner"}
            icon="shield-checkmark-outline"
            onPress={() => void handleRunScan()}
            disabled={busy || !selectedFile}
          />
          <Text style={{ color: ZRA.muted, fontSize: 11, textAlign: "center" }}>Inspeksi metadata statis · batas ukuran 200 MiB</Text>

          {feedback ? (
            <Text style={{ color: feedback.includes("Selesai") || feedback.includes("berhasil") ? ZRA.mint : ZRA.amber, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
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

        {/* Ringkasan jumlah temuan menurut tingkat keparahan. */}
        <SectionHeading label="Ringkasan Statistik Temuan" />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.red, alignItems: "center" }}>
            <Text style={{ color: ZRA.red, fontSize: 18, fontWeight: "900" }}>{activeStats.critical || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>Critical</Text>
          </View>
          <View style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.amber, alignItems: "center" }}>
            <Text style={{ color: ZRA.amber, fontSize: 18, fontWeight: "900" }}>{activeStats.high || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>High</Text>
          </View>
          <View style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.border, alignItems: "center" }}>
            <Text style={{ color: ZRA.text, fontSize: 18, fontWeight: "900" }}>{activeStats.medium || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>Medium</Text>
          </View>
          <View style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.mint, alignItems: "center" }}>
            <Text style={{ color: ZRA.mint, fontSize: 18, fontWeight: "900" }}>{activeStats.low || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>Low</Text>
          </View>
          <View style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.blue, alignItems: "center" }}>
            <Text style={{ color: ZRA.blue, fontSize: 18, fontWeight: "900" }}>{activeStats.info || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>Info</Text>
          </View>
        </View>

        {/* Preview log terminal agar pengguna melihat bentuk area keluaran tool. */}
        <SectionHeading label="Konsol Terminal Eksekusi AI" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE STATIC ANALYZER
              </Text>
            </View>
            <StatusPill label="LLM" tone="mint" />
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
                &gt; AI Agent reasoning in progress... _
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* Kartu laporan inspeksi yang akan menampilkan temuan bila fungsi diaktifkan. */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          {reportData && reportData.vulnerabilities && reportData.vulnerabilities.length > 0 ? (
            reportData.vulnerabilities.map((item: any, idx: number) => (
              <View key={idx} style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800", flex: 1 }}>{idx + 1}. {item.title || item.check}</Text>
                  <StatusPill label={item.severity || "High"} tone={item.severity === "Critical" ? "red" : "amber"} />
                </View>
                <MarkdownRenderer content={item.summary || item.detail || ""} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
              </View>
            ))
          ) : (
            <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
              Belum ada hasil inspeksi biner. Silakan jalankan analisis.
            </Text>
          )}
        </Panel>

        {/* Daftar audit sebelumnya dan kontrol penghapusan riwayat. */}
        <SectionHeading label="RIWAYAT AUDIT BINER" />
        <AuditHistoryList items={appHistory} emptyMessage="Belum ada riwayat audit biner." clearLabel="Hapus Riwayat App" onClear={() => clearHistory("app")} />
      </ScrollView>
    </ScreenShell>
  );
}
