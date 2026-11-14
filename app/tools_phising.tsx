// Tujuan file: Memeriksa indikator phishing pada URL dan halaman publik secara pasif.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { AuditWriteup } from "@/components/audit-writeup";
import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { useAppState } from "@/lib/app-state";

export default function ToolsPhisingScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();
  const [targetUrl, setTargetUrl] = useState("");
  const [labMode, setLabMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [report, setReport] = useState<any | null>(null);
  const phisingHistory = filterAuditHistory(history, "phising");

  const handleScan = async () => {
    const url = targetUrl.trim();
    if (!url) {
      setFeedback("Masukkan URL yang ingin diperiksa.");
      return;
    }

    setBusy(true);
    setReport(null);
    setFeedback("Memeriksa indikator URL dan halaman secara pasif...");
    try {
      const response = await fetch(`${apiUrl}/tools/phising/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...websiteAuditHeaders },
        body: JSON.stringify({ url, labMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Desktop Controller mengembalikan HTTP ${response.status}.`);

      setReport(data);
      setFeedback(`${data.verdict || "Pemeriksaan selesai"} · skor ${data.score ?? 0}/100.`);
      addHistory({
        kind: "SCAN",
        title: `Phishing Check: ${data.target || "URL"}`,
        subtitle: `${data.verdict || "Selesai"} · skor ${data.score ?? 0}/100`,
        status: "completed",
        payload: { action: "phising_url_check", target: data.target },
        result: data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pemeriksaan URL gagal.";
      setFeedback(`Gagal memeriksa URL: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const verdictTone = report?.score >= 60 ? "red" : report?.score >= 30 ? "amber" : "mint";

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
          eyebrow="ZRACORE / PROTECTION"
          title="Phishing Check."
          subtitle="Periksa indikator URL dan halaman web yang mungkin digunakan untuk phishing."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={ZRA.mint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>PHISHING INDICATOR SCANNER</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>HTTP GET saja · tanpa login atau payload</Text>
              </View>
            </View>
            <StatusPill label="PASSIVE" tone="mint" />
          </View>
        </Panel>

        <SectionHeading label="URL Target" />
        <Panel style={{ gap: 12 }}>
          <Field
            label="URL website"
            value={targetUrl}
            onChangeText={(value) => { setTargetUrl(value); setLabMode(false); }}
            placeholder="https://example.com/login"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>
            Gunakan URL publik. Pemindai mengambil halaman dengan HTTP GET, mengikuti maksimal 3 redirect, dan membaca maksimal 512 KB HTML serta pola skrip inline secara statis. JavaScript tidak dijalankan dan form tidak dikirim. Untuk latihan, gunakan tombol lab lokal.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setTargetUrl("http://127.0.0.1:8091/login-demo");
              setLabMode(true);
              setFeedback("Mode lab dipilih. Pastikan server phising_lab berjalan di Desktop.");
            }}
            style={{ minHeight: 42, borderWidth: 1, borderColor: ZRA.border, borderRadius: 10, padding: 10, alignItems: "center", justifyContent: "center", backgroundColor: ZRA.surface }}
          >
            <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>Isi URL Lab Phishing Lokal</Text>
          </Pressable>
          <PrimaryButton
            label={busy ? "Memeriksa URL..." : "Periksa Indikator Phishing"}
            icon="search-outline"
            onPress={() => void handleScan()}
            disabled={busy || !targetUrl.trim()}
          />
          {feedback ? <Text style={{ color: feedback.startsWith("Gagal") ? ZRA.amber : ZRA.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{feedback}</Text> : null}
        </Panel>

        {report ? (
          <Panel style={{ gap: 12, backgroundColor: ZRA.surfaceRaised }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: ZRA.text, flex: 1, fontSize: 14, fontWeight: "900" }}>{report.verdict}</Text>
              <StatusPill label={`${String(report.confidence || "rendah").toUpperCase()} · ${report.score}/100`} tone={verdictTone} />
            </View>
            {report.labMode ? <StatusPill label="SIMULASI LAB LOKAL" tone="amber" /> : null}
            <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>{report.limitations}</Text>
            <AuditWriteup report={report} showStats={false} emptyMessage="Belum ada hasil pemeriksaan." />
          </Panel>
        ) : null}

        <SectionHeading label="Riwayat Pemeriksaan Phishing" />
        <AuditHistoryList
          items={phisingHistory}
          emptyMessage="Belum ada riwayat pemeriksaan URL."
          clearLabel="Hapus Riwayat Phishing"
          onClear={() => clearHistory("phising")}
        />
      </ScrollView>
    </ScreenShell>
  );
}
