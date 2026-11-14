// Tujuan file: File layar tool vps; berisi input, kontrol, dan hasil yang terlihat bagi pengguna.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { AuditWriteup } from "@/components/audit-writeup";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";
import { useProgressiveReport } from "@/hooks/use-progressive-report";

export default function ToolsVpsScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();

  const [scanMode, setScanMode] = useState<"external" | "authenticated">("external");
  const [targetIp, setTargetIp] = useState("");
  const [vpsPort, setVpsPort] = useState("22");
  const [sshUser, setSshUser] = useState("root");
  const [sshPassword, setSshPassword] = useState("");
  const [sshHostFingerprint, setSshHostFingerprint] = useState("");
  const [observedHostFingerprint, setObservedHostFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { report: reportData, revealReport, clearReport } = useProgressiveReport();
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    "[READY] VPS Scan Rule Engine Initialized.",
    "[IDLE] Menunggu target IP VPS untuk memulai audit...",
  ]);
  const vpsHistory = filterAuditHistory(history, "vps");
  const activeStats = reportData?.stats || { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };

  const handleRunVpsScan = async () => {
    const ip = targetIp.trim();
    if (!ip) {
      setFeedback("Masukkan IP Address VPS / Host terlebih dahulu.");
      return;
    }
    if (scanMode === "authenticated" && !sshPassword.trim()) {
      setFeedback("Password SSH wajib diisi untuk mode Dengan Login.");
      return;
    }
    if (scanMode === "authenticated" && !sshHostFingerprint.trim()) {
      setFeedback("Fingerprint host SSH wajib diverifikasi sebelum mengirim password.");
      return;
    }

    setBusy(true);
    setObservedHostFingerprint("");
    clearReport();
    setFeedback(`Menjalankan VPS Security (${scanMode === "external" ? "Tanpa Login" : "Dengan Login"})...`);
    setScanProgress(15);
    setScanPhase("Target Profiling & Access Verification...");

    setTerminalLogs([
      `[INIT] VPS Target registered: ${ip}:${vpsPort} (${sshUser})`,
      `[MODE] Audit Mode: ${scanMode === "external" ? "Tanpa Login (Pre-Auth External)" : "Dengan Login (Post-Auth Authenticated)"}`,
      scanMode === "authenticated" ? `[AUTH] Establishing authenticated SSH channel...` : `[SCAN] Running external port & service enumeration...`,
    ]);

    try {
      setScanProgress(45);
      setScanPhase("Menghubungkan ke Desktop VPS Orchestrator...");

      const targetUrl = apiUrl || "http://127.0.0.1:4317";
      const response = await fetch(`${targetUrl}/tools/vps/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...websiteAuditHeaders,
        },
        body: JSON.stringify({
          targetIp: ip,
          port: vpsPort.trim() || "22",
          sshUser: sshUser.trim() || "root",
          sshPassword: scanMode === "authenticated" ? sshPassword : "",
          expectedHostFingerprint: scanMode === "authenticated" ? sshHostFingerprint.trim() : "",
          scanMode: scanMode === "authenticated" ? "internal" : "external",
        }),
      });

      setScanProgress(85);
      setScanPhase("Memproses hasil temuan rule engine...");

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (typeof errBody.hostFingerprint === "string") setObservedHostFingerprint(errBody.hostFingerprint);
        throw new Error(errBody.error || `Desktop Controller mengembalikan HTTP ${response.status}.`);
      }

      const report = await response.json();
      setScanProgress(90);
      setScanPhase("Menampilkan temuan satu per satu...");
      setFeedback(`Inspeksi VPS selesai: ${report.stats?.total || 0} temuan. Menampilkan hasil...`);

      setTerminalLogs(Array.isArray(report.logs) ? report.logs : ["[DONE] Pemindaian VPS selesai."]);

      addHistory({
        kind: "SCAN",
        title: `VPS Audit (${scanMode}): ${ip}:${vpsPort}`,
        subtitle: `${report.stats?.total || 0} findings compiled`,
        status: "completed",
        payload: { action: "scan_vps", mode: scanMode },
        result: report,
      });
      await revealReport(report, (finding) => {
        const title = String(finding.title || finding.check || "Temuan terkonfirmasi");
        setTerminalLogs((current) => [...current, `[SUCCESS] ${title}`]);
      });
      setScanProgress(100);
      setScanPhase("Inspeksi VPS selesai.");
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Inspeksi VPS gagal.";
      setFeedback(`Gagal menjalankan inspeksi: ${message}`);
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
          title="VPS &amp; Server."
          subtitle="Pemeriksaan port publik atau konfigurasi dasar server melalui SSH."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="server-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>VPS SCANNING</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>{scanMode === "external" ? "Tanpa Login (Pre-Auth)" : "Dengan Login (Post-Auth)"}</Text>
              </View>
            </View>
            <StatusPill label="RULE ENGINE" tone="mint" />
          </View>
        </Panel>

        {/* MODE AKSES: Tanpa Login vs Dengan Login */}
        <SectionHeading label="MODE AKSES" />
        <Panel style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => {
                setScanMode("external");
                setSshPassword("");
              }}
              style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: scanMode === "external" ? ZRA.mintDim : ZRA.surface, borderWidth: 1, borderColor: scanMode === "external" ? ZRA.mint : ZRA.border, alignItems: "center" }}
            >
              <Text style={{ color: scanMode === "external" ? ZRA.mint : ZRA.text, fontWeight: "800", fontSize: 13 }}>Tanpa Login</Text>
            </Pressable>
            <Pressable
              onPress={() => setScanMode("authenticated")}
              style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: scanMode === "authenticated" ? ZRA.mintDim : ZRA.surface, borderWidth: 1, borderColor: scanMode === "authenticated" ? ZRA.mint : ZRA.border, alignItems: "center" }}
            >
              <Text style={{ color: scanMode === "authenticated" ? ZRA.mint : ZRA.text, fontWeight: "800", fontSize: 13 }}>Dengan Login</Text>
            </Pressable>
          </View>

          <Field
            label="IP Address VPS / Host"
            value={targetIp}
            onChangeText={setTargetIp}
            placeholder="Contoh: 103.152.118.10"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Port SSH"
                value={vpsPort}
                onChangeText={setVpsPort}
                placeholder="22"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="User SSH"
                value={sshUser}
                onChangeText={setSshUser}
                placeholder="root"
                autoCapitalize="none"
              />
            </View>
          </View>

          {scanMode === "authenticated" ? (
            <>
              <Field
                label="Fingerprint Host SSH (SHA256)"
                value={sshHostFingerprint}
                onChangeText={setSshHostFingerprint}
                placeholder="SHA256:..."
                hint="Ambil melalui kanal tepercaya, misalnya: ssh-keyscan -p PORT HOST | ssh-keygen -lf -. Cocokkan fingerprint sebelum memasukkan password."
                autoCapitalize="none"
                autoCorrect={false}
              />
              {observedHostFingerprint ? <Text selectable style={{ color: ZRA.amber, fontSize: 11, lineHeight: 16 }}>Fingerprint yang diterima: {observedHostFingerprint}. Verifikasi secara terpisah sebelum menggunakannya.</Text> : null}
              <Field
                label="Password SSH"
                value={sshPassword}
                onChangeText={setSshPassword}
                placeholder="Masukkan password SSH"
                secureTextEntry={true}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}

          <PrimaryButton
            label={busy ? "Rule Engine Sedang Menginspeksi..." : `Mulai Inspeksi VPS (${scanMode === "external" ? "Tanpa Login" : "Dengan Login"})`}
            icon="terminal-outline"
            onPress={() => void handleRunVpsScan()}
            disabled={busy || !targetIp.trim() || (scanMode === "authenticated" && (!sshPassword.trim() || !sshHostFingerprint.trim()))}
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

        {/* Preview log terminal untuk tampilan inspeksi server. */}
        <SectionHeading label="Konsol Terminal Rule Engine" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE VPS &amp; RULE ENGINE CONSOLE
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
                  color: line.includes("SUCCESS") ? ZRA.mint : line.includes("MODE") ? ZRA.amber : line.includes("INIT") ? ZRA.blue : "#34d399",
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
                &gt; VPS Rule Engine pipeline in progress... _
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* Kartu hasil pemeriksaan yang akan menampilkan temuan server. */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          <AuditWriteup report={reportData} showStats={false} emptyMessage="Belum ada hasil inspeksi VPS. Silakan jalankan analisis." />
        </Panel>

        {/* Daftar inspeksi VPS sebelumnya. */}
        <SectionHeading label="RIWAYAT INSPEKSI VPS & SERVER" />
        <AuditHistoryList items={vpsHistory} emptyMessage="Belum ada riwayat inspeksi VPS." clearLabel="Hapus Riwayat VPS" onClear={() => clearHistory("vps")} />
      </ScrollView>
    </ScreenShell>
  );
}
