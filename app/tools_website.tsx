// Tujuan file: File layar tool website; berisi input, kontrol, dan hasil yang terlihat bagi pengguna.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

function safeTargetLabel(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.split(/[?#]/, 1)[0];
  }
}

export default function ToolsWebsiteScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, history, addHistory, clearHistory, websiteAuditHeaders, tokenPresent } = useAppState();

  const [targetUrl, setTargetUrl] = useState("");
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [accessMode, setAccessMode] = useState<"anonymous" | "login">("anonymous");
  const [activeProbe, setActiveProbe] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [feedback, setFeedback] = useState("");
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[READY] ZraCore passive lab audit initialized.",
    "[IDLE] Menunggu URL lab yang diizinkan.",
  ]);

  const websiteHistory = filterAuditHistory(history, "website");

  const activeStats = reportData?.stats || {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  // Pakai renderer yang sama untuk hasil terbaru dan laporan yang dibuka dari riwayat.
  const renderAuditReport = (report: any, emptyMessage: string) => {
    if (!report) {
      return <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>{emptyMessage}</Text>;
    }

    const stats = report.stats || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    return (
      <View style={{ gap: 12 }}>
        {report.scanType ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Jenis audit: {report.scanType}</Text> : null}
        {report.authentication ? (
          <View style={{ padding: 10, borderRadius: 9, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 4 }}>
            <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "800" }}>
              Status akses: {report.authentication.status === "authenticated" ? "Login terverifikasi" : "Tanpa login"}
            </Text>
            {report.authentication.loginPagePath ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Halaman login: {report.authentication.loginPagePath}</Text> : null}
            <Text style={{ color: ZRA.muted, fontSize: 9 }}>Kredensial dan cookie sesi tidak disertakan pada laporan.</Text>
          </View>
        ) : null}
        {report.summary ? <MarkdownRenderer content={report.summary} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={12} /> : null}
        {report.limitations ? <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>{report.limitations}</Text> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {([
            ["Critical", stats.critical, ZRA.red],
            ["High", stats.high, ZRA.amber],
            ["Medium", stats.medium, ZRA.amber],
            ["Low", stats.low, ZRA.mint],
            ["Info", stats.info, ZRA.blue],
          ] as const).map(([label, count, color]) => (
            <View key={label} style={{ flexGrow: 1, minWidth: 56, padding: 8, borderRadius: 9, borderWidth: 1, borderColor: color, alignItems: "center", backgroundColor: ZRA.surface }}>
              <Text style={{ color, fontSize: 15, fontWeight: "900" }}>{count || 0}</Text>
              <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>{label}</Text>
            </View>
          ))}
        </View>

        {Array.isArray(report.pages) && report.pages.length > 0 ? (
          <View style={{ gap: 7 }}>
            <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>HALAMAN YANG DIPERIKSA</Text>
            {report.pages.map((page: any, index: number) => (
              <View key={`${page.url || "page"}-${index}`} style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 3 }}>
                <Text selectable style={{ color: ZRA.mint, fontSize: 10, fontWeight: "700" }}>{page.title || page.url || `Halaman ${index + 1}`}</Text>
                {page.title && page.url ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>{page.url}</Text> : null}
                <Text style={{ color: ZRA.muted, fontSize: 9 }}>HTTP {page.status ?? "-"} · {page.links ?? 0} tautan · {page.forms ?? 0} form</Text>
                {page.responseHeaders && Object.keys(page.responseHeaders).length > 0 ? (
                  <View style={{ marginTop: 3, gap: 2 }}>
                    {Object.entries(page.responseHeaders).map(([name, value]) => (
                      <Text key={name} selectable style={{ color: ZRA.muted, fontSize: 8 }}>{name}: {String(value)}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {Array.isArray(report.logs) && report.logs.length > 0 ? (
          <View style={{ padding: 10, borderRadius: 8, backgroundColor: "#060a0f", gap: 4 }}>
            <Text style={{ color: ZRA.mint, fontSize: 9, fontWeight: "900" }}>LOG AUDIT</Text>
            {report.logs.map((line: string, index: number) => <Text key={`${index}-${line}`} selectable style={{ color: "#34d399", fontSize: 9, lineHeight: 14, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{line}</Text>)}
          </View>
        ) : null}

        {Array.isArray(report.vulnerabilities) && report.vulnerabilities.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>TEMUAN / OBSERVASI</Text>
            {report.vulnerabilities.map((item: any, index: number) => (
              <View key={`${item.title || item.check || "finding"}-${index}`} style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800", flex: 1 }}>{index + 1}. {item.title || item.check || "Observasi"}</Text>
                  <StatusPill label={(item.severity || "info").toUpperCase()} tone={item.severity === "critical" || item.severity === "high" ? "red" : "amber"} />
                </View>
                {item.check ? <Text style={{ color: ZRA.muted, fontSize: 10 }}>Pemeriksaan: {item.check}</Text> : null}
                {item.endpoint ? <Text selectable style={{ color: ZRA.mint, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{item.endpoint}</Text> : null}
                <MarkdownRenderer content={item.summary || item.detail || "Tidak ada uraian tambahan."} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
                {item.pocCode || item.poc ? <Text selectable style={{ color: ZRA.amber, fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>PoC: {item.pocCode || item.poc}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 8 }}>Tidak ada temuan pada laporan ini.</Text>
        )}
      </View>
    );
  };

  // Kirim URL lab dan, bila dipilih, kredensial sementara untuk sesi audit terbatas.
  const handleRunAiPentest = async () => {
    const target = targetUrl.trim();
    if (!target) {
      setFeedback("Masukkan link target web terlebih dahulu.");
      return;
    }
    if (!scopeConfirmed) {
      setFeedback("Konfirmasi bahwa URL ini adalah target yang Anda berwenang audit.");
      return;
    }

    setBusy(true);
    setReportData(null);
    if (accessMode === "login" && (!loginUser.trim() || !loginPass)) {
      setFeedback("Masukkan username dan password akun lab untuk mode login.");
      setBusy(false);
      setScanProgress(null);
      return;
    }
    if (!tokenPresent) {
      setFeedback("Hubungkan mobile ke Desktop dengan API Key aktif sebelum menjalankan audit.");
      setBusy(false);
      setScanProgress(null);
      return;
    }

    setFeedback(activeProbe ? "Menjalankan probe marker lokal dan audit pasif..." : accessMode === "login" ? "Login ke lab dan menyiapkan crawl terbatas..." : "Mengambil halaman lab dan menyiapkan analisis Groq...");
    setScanProgress(10);
    setScanPhase(activeProbe ? "Memeriksa refleksi marker inert di loopback..." : accessMode === "login" ? "Membuat sesi lab lalu memetakan halaman..." : "Mengirim permintaan GET pasif ke target...");

    const formattedUrl = target.startsWith("http") ? target : `http://${target}`;
    const safeTarget = safeTargetLabel(formattedUrl);

    setTerminalLogs([
      `[START] Audit website untuk ${safeTarget}`,
      "[SCOPE] Hanya audit URL yang Anda berwenang uji; crawl dibatasi ke origin target.",
      accessMode === "login"
        ? "[AUTH] Kredensial hanya dikirim untuk form login POST same-origin; tidak dimasukkan ke laporan."
        : activeProbe
          ? "[SAFE-PROBE] Satu marker teks inert; hanya localhost/loopback, tanpa kode executable atau form."
          : "[ATTACK] Memulai fuzzing parameter aktif; payload XSS, SQLi, LFI, dan RCE akan ditembakkan secara agresif.",
    ]);

    try {
      const response = await fetch(`${apiUrl}/tools/website`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...websiteAuditHeaders },
        body: JSON.stringify({
          targetUrl: formattedUrl,
          accessMode,
          activeProbe: activeProbe && accessMode === "anonymous",
          scopeConfirmed,
          ...(accessMode === "login" ? { loginUser: loginUser.trim(), loginPass } : {}),
        }),
      }).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Desktop Controller tidak terjangkau: ${reason || "periksa koneksi dan URL API Desktop."}`);
      });

      setScanProgress(80);
      setScanPhase("Menunggu hasil analisis Groq...");

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || `Desktop Controller API mengembalikan HTTP ${response.status}.`);
      }

      const data = await response.json();
      setReportData(data);
      setTerminalLogs(Array.isArray(data.logs) ? data.logs : ["[DONE] Audit selesai; log server tidak tersedia."]);
      setScanProgress(100);
      setScanPhase("Audit pasif selesai.");
      setFeedback(`Audit lab selesai. ${data.stats?.total || 0} observasi ditemukan.`);

      addHistory({
        kind: "SCAN",
        title: `Website Pentest: ${safeTarget}`,
        subtitle: `${data.stats?.total || 0} observasi tercatat`,
        status: "completed",
        payload: { action: "ai_pentest_audit", target: safeTarget },
        result: data,
      });
    } catch (err: any) {
      const message = err?.message || "Terjadi kesalahan yang tidak diketahui.";
      setFeedback(`Gagal menjalankan audit: ${message}`);
      setTerminalLogs((current) => [...current, `[ERROR] ${message}`]);
    } finally {
      setBusy(false);
      setLoginPass("");
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
          title="Website Pentest."
          subtitle="Audit aktif agresif URL publik yang Anda berwenang uji: injeksi parameter otomatis untuk mendeteksi kerentanan kritis."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="globe-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>WEBSITE PENTEST</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>LLM · audit pasif lab</Text>
              </View>
            </View>
            <StatusPill label="LLM" tone="mint" />
          </View>
        </Panel>

        {/* Input URL, mode akses, dan konfirmasi bahwa target diizinkan. */}
        <SectionHeading label="Target Website" />
        <Panel style={{ gap: 12 }}>
          <Field
            label="URL Target Web"
            value={targetUrl}
            onChangeText={(value) => {
              setTargetUrl(value);
              setScopeConfirmed(false);
            }}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <SectionHeading label="Mode Akses" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAccessMode("anonymous")}
              style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: accessMode === "anonymous" ? ZRA.mint : ZRA.border, backgroundColor: accessMode === "anonymous" ? ZRA.mintDim : ZRA.surfaceRaised, alignItems: "center", justifyContent: "center", padding: 10 }}
            >
              <Text style={{ color: accessMode === "anonymous" ? ZRA.mint : ZRA.muted, fontSize: 12, fontWeight: "800" }}>Tanpa Login</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActiveProbe(false);
                setAccessMode("login");
              }}
              style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: accessMode === "login" ? ZRA.mint : ZRA.border, backgroundColor: accessMode === "login" ? ZRA.mintDim : ZRA.surfaceRaised, alignItems: "center", justifyContent: "center", padding: 10 }}
            >
              <Text style={{ color: accessMode === "login" ? ZRA.mint : ZRA.muted, fontSize: 12, fontWeight: "800" }}>Dengan Login</Text>
            </Pressable>
          </View>

          {accessMode === "login" ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Username / Email"
                  value={loginUser}
                  onChangeText={setLoginUser}
                  placeholder="Akun lab lokal"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Password"
                  value={loginPass}
                  onChangeText={setLoginPass}
                  placeholder="Password lab"
                  secureTextEntry
                />
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: scopeConfirmed }}
            onPress={() => setScopeConfirmed((value) => !value)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: scopeConfirmed ? ZRA.mint : ZRA.border, backgroundColor: scopeConfirmed ? ZRA.mintDim : ZRA.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
              {scopeConfirmed ? <Ionicons name="checkmark" size={15} color={ZRA.mint} /> : null}
            </View>
            <Text style={{ flex: 1, color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>
              Saya mengonfirmasi URL ini adalah target yang saya berwenang audit secara pasif.
            </Text>
          </Pressable>

          <PrimaryButton
            label={busy ? "Audit Lab Berjalan..." : "Mulai Audit Lab"}
            icon="play-outline"
            onPress={() => void handleRunAiPentest()}
            disabled={busy || !targetUrl.trim() || !scopeConfirmed}
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

        {/* METRIC STATS CARDS ALWAYS VISIBLE */}
        {/* Jumlah observasi yang dibuat oleh pemeriksaan Desktop. */}
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

        {/* TERMINAL AI EXECUTION CONSOLE CARD (ALWAYS VISIBLE ABOVE HASIL/OUTPUT) */}
        {/* Log proses aktual dari Desktop; bukan daftar tahapan yang dibuat UI. */}
        <SectionHeading label="Konsol Audit Lab & Analisis AI" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE LAB AUDIT CONSOLE
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
          </View>
        </Panel>

        {/* Laporan terbaru dan laporan yang dibuka dari riwayat memakai format yang sama. */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil Audit Lab &amp; Observasi" />
          {renderAuditReport(reportData, "Belum ada hasil audit. Silakan jalankan pemindaian website di atas.")}
        </Panel>

        {/* Daftar audit website yang tersimpan di histori aplikasi. */}
        <SectionHeading label="RIWAYAT AUDIT" />
        <AuditHistoryList
          items={websiteHistory}
          emptyMessage="Belum ada riwayat audit website."
          clearLabel="Hapus Semua Riwayat Website"
          onClear={() => clearHistory("web")}
        />
      </ScrollView>
    </ScreenShell>
  );
}
