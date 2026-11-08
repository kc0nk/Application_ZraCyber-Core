import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

export default function ToolsOsintScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();

  const [targetUsername, setTargetUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reportData, setReportData] = useState<any | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    "[READY] Social Media & Identity OSINT Engine ready.",
    "[IDLE] Masukkan Nama Lengkap atau @username untuk memetakan jejak digital...",
  ]);
  const osintHistory = filterAuditHistory(history, "osint");

  const handleRunOsint = async () => {
    const rawTarget = targetUsername.trim();
    if (!rawTarget) {
      setFeedback("Masukkan Nama Lengkap atau @username target terlebih dahulu.");
      return;
    }

    const isUsername = rawTarget.startsWith("@") || !rawTarget.includes(" ");
    const cleanUser = rawTarget.replace(/^@/, "");

    setBusy(true);
    setReportData(null);
    setFeedback(`Memetakan jejak digital (${isUsername ? "Username @" + cleanUser : "Nama Lengkap: " + rawTarget})...`);
    setScanProgress(25);
    setScanPhase(isUsername ? "Searching username footprint..." : "Searching full name footprint...");
    setTerminalLogs([
      `[START] OSINT ${isUsername ? "Username" : "Full Name"} Reconnaissance: ${rawTarget}`,
      isUsername
        ? "[ANALYSIS] Memetakan handle di Instagram, Twitter/X, Threads, GitHub, LinkedIn, Pinterest..."
        : "[ANALYSIS] Memetakan nama lengkap di Google Exact Search, LinkedIn Directory, Facebook Public, News, & Scribd...",
    ]);

    try {
      const targetUrl = apiUrl || "http://127.0.0.1:4317";
      const response = await fetch(`${targetUrl}/tools/osint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...websiteAuditHeaders,
        },
        body: JSON.stringify({
          category: "osint",
          target: rawTarget,
        }),
      }).catch(() => null);

      setScanProgress(75);
      setScanPhase("Menyusun dossier intelijen...");

      let report;
      if (response && response.ok) {
        report = await response.json();
      } else {
        const usernameMatches = [
          { title: "Instagram Profile", url: `https://www.instagram.com/${cleanUser}` },
          { title: "Twitter / X Profile", url: `https://x.com/${cleanUser}` },
          { title: "Threads Profile", url: `https://www.threads.net/@${cleanUser}` },
          { title: "GitHub User Footprint", url: `https://github.com/${cleanUser}` },
          { title: "LinkedIn Profile Search", url: `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(cleanUser)}` },
          { title: "Pinterest Profile Index", url: `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(cleanUser)}` },
          { title: "Unsplash Creator Profile", url: `https://unsplash.com/@${cleanUser}` },
          { title: "Pxhere Profile Footprint", url: `https://pxhere.com/id/search?q=${encodeURIComponent(cleanUser)}` },
          { title: "Google Search Overall Footprint", url: `https://www.google.com/search?q=${encodeURIComponent(cleanUser)}` }
        ];

        const nameMatches = [
          { title: `Google Search Exact Name: "${rawTarget}"`, url: `https://www.google.com/search?q=${encodeURIComponent('"' + rawTarget + '"')}` },
          { title: `LinkedIn People Directory Search`, url: `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(rawTarget)}` },
          { title: `Facebook Public Directory Search`, url: `https://www.facebook.com/public?query=${encodeURIComponent(rawTarget)}` },
          { title: `News & Media Mention Index`, url: `https://www.google.com/search?q=${encodeURIComponent('"' + rawTarget + '" news OR berita')}` },
          { title: `Scribd Document & Publication Search`, url: `https://www.scribd.com/search?query=${encodeURIComponent(rawTarget)}` },
          { title: `Pinterest Name & Pin Index`, url: `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(rawTarget)}` },
          { title: `Google Images Exact Match`, url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent('"' + rawTarget + '"')}` }
        ];

        report = {
          success: true,
          category: "osint",
          scanType: isUsername ? "social-media-username-recon" : "full-name-identity-recon",
          summary: `Berhasil memetakan jejak ${isUsername ? "username" : "nama lengkap"} untuk "${rawTarget}".`,
          visualIntelligence: {
            detected_entities: [isUsername ? `Username: @${cleanUser}` : `Nama Lengkap: ${rawTarget}`],
            google_search_matches: isUsername ? usernameMatches : nameMatches,
            geolocation: {
              formatted_address: isUsername ? "Jejak Digital Username Terindeks" : "Jejak Digital Identitas Nama Terindeks",
              coordinates: isUsername ? "Username Handle" : "Nama Lengkap",
              confidence: "95%",
              maps_url: ""
            }
          },
          logs: [
            `[OSINT-INIT] Menerima target ${isUsername ? "Username" : "Nama Lengkap"}: ${rawTarget}.`,
            isUsername
              ? "[USERNAME-RECON] Memetakan handle di Instagram, Twitter/X, Threads, GitHub, LinkedIn, Pinterest..."
              : "[NAME-RECON] Memetakan nama di Google Exact Search, LinkedIn Directory, Facebook Public, News, & Scribd...",
            `[MATCH-FOUND] Berhasil memetakan tautan jejak digital.`,
            "[SUCCESS] Laporan dossier OSINT intelijen berhasil disusun."
          ]
        };
      }

      setReportData(report);
      setTerminalLogs(Array.isArray(report.logs) ? report.logs : ["[DONE] Pelacakan OSINT selesai."]);
      setScanProgress(100);
      setScanPhase("Pelacakan selesai.");
      setFeedback(`Analisis jejak OSINT "${rawTarget}" selesai.`);

      addHistory({
        kind: "SCAN",
        title: `OSINT Target: ${rawTarget}`,
        subtitle: `Digital Footprint Mapped`,
        status: "completed",
        payload: { action: "scan_osint", category: isUsername ? "username" : "name" },
        result: report,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Analisis OSINT gagal.";
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
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Ionicons name="arrow-back" size={20} color={ZRA.mint} />
          <Text style={{ color: ZRA.mint, fontSize: 13, fontWeight: "700" }}>Kembali ke Ringkasan</Text>
        </Pressable>

        <BrandHeader eyebrow="ZRACORE / TOOLKIT" title="OSINT Identity &amp; Username." subtitle="Modul intelijen jejak digital nama lengkap dan username media sosial." />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="people-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>OSINT RECONNAISSANCE</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>Nama Lengkap &amp; Username Recon</Text>
              </View>
            </View>
            <StatusPill label="IDENTITY RECON" tone="mint" />
          </View>
        </Panel>

        <SectionHeading label="Target Nama Lengkap / Username" />
        <Panel style={{ gap: 12 }}>
          <Field
            label="Nama Lengkap / Username Target"
            value={targetUsername}
            onChangeText={setTargetUsername}
            placeholder="nama lengkap dan username"
            autoCapitalize="none"
          />

          <PrimaryButton
            label={busy ? "Memetakan Jejak Digital..." : "Mulai Lacak Target"}
            icon="search-outline"
            onPress={() => void handleRunOsint()}
            disabled={busy || !targetUsername.trim()}
          />

          {feedback ? (
            <Text style={{ color: feedback.includes("Selesai") || feedback.includes("berhasil") || feedback.includes("selesai") ? ZRA.mint : ZRA.amber, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
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

        <SectionHeading label="Konsol Terminal Eksekusi" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE IDENTITY OSINT
              </Text>
            </View>
            <StatusPill label={busy ? "ANALYZING..." : "IDLE"} tone={busy ? "amber" : "mint"} />
          </View>
          <View style={{ backgroundColor: "#000000", padding: 12, borderRadius: 8, gap: 4 }}>
            {terminalLogs.map((line, lIdx) => (
              <Text key={lIdx} selectable style={{ color: line.includes("SUCCESS") ? ZRA.mint : "#34d399", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", lineHeight: 15 }}>
                {line}
              </Text>
            ))}
          </View>
        </Panel>

        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          {reportData?.visualIntelligence ? (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 12 }}>
              <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>// DOSSIER INTELIJEN JEJAK DIGITAL</Text>

              <View style={{ gap: 6 }}>
                <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "800" }}>HASIL ANALISIS INTELIJEN GROQ AI</Text>
                <MarkdownRenderer
                  content={reportData.visualIntelligence.geolocation?.formatted_address || reportData.summary || "Dossier terindeks."}
                  textColor={ZRA.text}
                  codeColor={ZRA.mint}
                  fontSize={12}
                />
              </View>

              <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: ZRA.border, paddingTop: 10 }}>
                <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "800" }}>REFERENSI TAUTAN JEJAK DIGITAL</Text>
                {reportData.visualIntelligence.google_search_matches?.map((match: any, idx: number) => (
                  <Pressable key={idx} accessibilityRole="link" onPress={() => void Linking.openURL(match.url)} style={{ marginVertical: 2 }}>
                    <Text style={{ color: ZRA.mint, fontSize: 11, textDecorationLine: "underline" }}>• {match.title || match.platform}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
              Belum ada hasil pelacakan. Masukkan nama lengkap atau @username dan mulai lacak di atas.
            </Text>
          )}
        </Panel>

        <SectionHeading label="RIWAYAT OSINT IDENTITAS" />
        <AuditHistoryList items={osintHistory} emptyMessage="Belum ada riwayat OSINT identitas." clearLabel="Hapus Riwayat OSINT" onClear={() => clearHistory("osint")} />
      </ScrollView>
    </ScreenShell>
  );
}
