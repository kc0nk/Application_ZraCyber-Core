// Tujuan file: File layar tool file; berisi input, kontrol, dan hasil yang terlihat bagi pengguna.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { BrandHeader, Field, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { AuditWriteup } from "@/components/audit-writeup";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";
import { useProgressiveReport } from "@/hooks/use-progressive-report";

export default function ToolsFileScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();

  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { report: reportData, revealReport, clearReport } = useProgressiveReport();
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    "[READY] File Scanner & Deep Parser Engine initialized.",
    "[IDLE] Menunggu unggahan artefak file untuk analisis...",
  ]);
  const fileHistory = filterAuditHistory(history, "file");

  const activeStats = reportData?.stats || {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setSelectedFile(asset);
      clearReport();
      setFeedback("Berkas artefak siap dipindai.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Gagal memilih file.");
    }
  };

  const handleRunFileScan = async () => {
    if (!selectedFile) {
      setFeedback("Pilih berkas artefak terlebih dahulu.");
      return;
    }

    setBusy(true);
    clearReport();
    setFeedback("Menjalankan pipeline pemindaian file & malware...");
    setScanProgress(10);
    setScanPhase("Target Profiling & Hash Identity...");

    setTerminalLogs([
      `[00:00:01] > [TARGET] Profiling target file: ${selectedFile.name}`,
      `[00:00:02] > [HASH] Generating SHA-256 & MD5 fingerprints...`,
      `[00:00:04] > [DEEP_PARSER] Running Deep Parser Engine (structure, content, objects)...`,
      `[00:00:06] > [RECURSIVE] Executing Recursive Analysis (archives, nested objects)...`,
      `[00:00:08] > [INDICATOR] Indicator Engine extracting metadata, strings, & URLs...`,
      `[00:00:10] > [ANOMALY] Anomaly Engine analyzing entropy & structural mismatches...`,
      `[00:00:13] > [STATIC_ANALYSIS] Compiling Static Analysis & Metadata Graph...`,
      `[00:00:16] > [AI_ENGINE] AI Engine running detection, correlation, & triage...`,
      `[00:00:19] > [VERIFICATION] Verification Engine eliminating false positives...`,
      `[00:00:22] > [WRITEUP] Write-Up Engine compiling forensic report & evidence...`,
      `[00:00:25] > [SUCCESS] File Malware Analysis successfully completed!`
    ]);

    try {
      setScanProgress(40);
      setScanPhase("Mengunggah artefak ke Desktop Scanner...");

      const uploadResult = await FileSystem.uploadAsync(`${apiUrl}/tools/file/scan`, selectedFile.uri, {
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
      setScanPhase("Memproses hasil temuan & bukti...");

      if (uploadResult.status !== 200) {
        let errBody;
        try {
          errBody = JSON.parse(uploadResult.body);
        } catch {}
        throw new Error(errBody?.error || `Desktop Controller mengembalikan HTTP ${uploadResult.status}.`);
      }

      const report = JSON.parse(uploadResult.body);
      setScanProgress(90);
      setScanPhase("Menampilkan temuan satu per satu...");
      setFeedback(`Analisis selesai: ${report.stats?.total || 0} temuan. Menampilkan hasil...`);
      addHistory({
        kind: "SCAN",
        title: `File Scan: ${selectedFile.name}`,
        subtitle: `${report.stats?.total || 0} indicators found`,
        status: "completed",
        payload: { action: "scan_file_deep" },
        result: report,
      });
      await revealReport(report, (finding) => {
        const title = String(finding.title || finding.check || "Temuan terkonfirmasi");
        setTerminalLogs((current) => [...current, `[SUCCESS] ${title}`]);
      });
      setScanProgress(100);
      setScanPhase("Analisis file selesai.");
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Analisis file gagal.";
      setFeedback(`Gagal menjalankan analisis: ${message}`);
      setTerminalLogs((current) => [...current, `[ERROR] ${message}`]);
    } finally {
      setBusy(false);
      setTimeout(() => setScanProgress(null), 3000);
    }
  };

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
          title="File &amp; Malware."
          subtitle="Pemindaian YARA rules, deteksi backdoor, dan analisis entropy artefak."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>FILE SCANNING</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>Artifact &amp; Payload Analysis</Text>
              </View>
            </View>
            <StatusPill label="LLM" tone="mint" />
          </View>
        </Panel>

        {/* Input file dan parameter yang nantinya digunakan untuk pemeriksaan artefak. */}
        <SectionHeading label="Unggah Artefak &amp; Parameter" />
        <Panel style={{ gap: 12 }}>
          <SecondaryButton
            label={selectedFile ? `File: ${selectedFile.name}` : "Pilih Berkas Artefak"}
            icon="folder-open-outline"
            onPress={() => void handlePickFile()}
          />

          <PrimaryButton
            label={busy ? "Pemindaian Berjalan..." : "Mulai Pemindaian Malware"}
            icon="scan-outline"
            onPress={() => void handleRunFileScan()}
            disabled={busy || !selectedFile}
          />

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

        {/* Ringkasan temuan menurut tingkat keparahan. */}
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

        {/* Preview log terminal untuk proses analisis file. */}
        <SectionHeading label="Konsol Terminal Eksekusi AI" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE FILE SCANNER CONSOLE
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
                &gt; File scanner pipeline in progress... _
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* Tempat menampilkan hasil pemeriksaan file. */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          <AuditWriteup report={reportData} showStats={false} emptyMessage="Belum ada hasil pemindaian berkas. Silakan jalankan analisis." />
        </Panel>

        {/* Daftar pemindaian berkas sebelumnya. */}
        <SectionHeading label="RIWAYAT PEMINDAIAN BERKAS" />
        <AuditHistoryList items={fileHistory} emptyMessage="Belum ada riwayat pemindaian berkas." clearLabel="Hapus Riwayat File" onClear={() => clearHistory("file")} />
      </ScrollView>
    </ScreenShell>
  );
}
