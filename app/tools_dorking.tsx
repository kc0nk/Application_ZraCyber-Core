// Tujuan file: Layar pencarian pasif halaman publik berdasarkan domain, TLD, dan preset dork.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { AuditWriteup } from "@/components/audit-writeup";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

export default function ToolsDorkingScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();

  const [targetDomain, setTargetDomain] = useState("");
  const [selectedDorkType, setSelectedDorkType] = useState("all");
  const [confirmActiveScope, setConfirmActiveScope] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [dorkResults, setDorkResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [feedback, setFeedback] = useState("");

  const dorkHistory = filterAuditHistory(history, "dorking");
  const isTldWideScope = /^\*?\.?[a-z]{2,}$/i.test(targetDomain.trim());

  const pipelineSteps = [
    "1. Membentuk query pencarian sesuai scope",
    "2. Mencari halaman publik terindeks",
    "3. Menyusun hasil pencarian",
  ];

  const handleRunDorkScan = async () => {
    const domain = targetDomain.trim();
    if (!domain) {
      setFeedback("Masukkan domain target terlebih dahulu (contoh: my.id).");
      return;
    }

    setScanning(true);
    setScanStep(1);
    setFeedback(`1/3: Mencari halaman publik terindeks untuk ${domain}...`);

    try {
      const response = await fetch(`${apiUrl}/tools/dorking`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...websiteAuditHeaders },
        body: JSON.stringify({
          targetDomain: domain,
          dorkType: selectedDorkType,
          confirmActiveScope: !isTldWideScope && confirmActiveScope,
        }),
      }).catch((err) => {
        throw new Error(err?.message || "Desktop Controller API tidak terjangkau.");
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setScanStep(2);
      setFeedback("2/3: Menyusun halaman yang ditemukan...");
      setSummary(data);
      setDorkResults(data.urls || []);
      setScanStep(3);
      setFeedback(`${data.activeCheckRequested ? "Pencarian dan pemeriksaan ringan" : "Pencarian"} selesai. ${data.totalFound ?? 0} halaman ditemukan.`);

      addHistory({
        kind: "SCAN",
        title: `Dorking: ${domain}`,
        subtitle: `${data.totalFound ?? 0} halaman ditemukan (${data.modeLabel || "Pasif"})`,
        status: "completed",
        payload: { action: "dorking_recon", domain },
        result: data,
      });
    } catch (err: any) {
      const message = err?.message || "Terjadi kesalahan yang tidak diketahui.";
      setFeedback(`Gagal menjalankan dorking: ${message}`);
      setScanStep(0);
    } finally {
      setScanning(false);
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
          eyebrow="ZRACORE / RECON"
          title="Dorking & Recon."
          subtitle="Pencarian pasif halaman web publik berdasarkan domain, TLD, dan preset dork."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="search-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>DORKING TOOLKIT</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>OSINT &amp; Recon Pipeline</Text>
              </View>
            </View>
            <StatusPill label="ACTIVE" tone="mint" />
          </View>
        </Panel>

        <SectionHeading label="Target Domain &amp; Dork Preset" />
        <Panel style={{ gap: 12 }}>
          <Field
            label="Domain atau TLD"
            value={targetDomain}
            onChangeText={(value) => {
              setTargetDomain(value);
              setConfirmActiveScope(false);
            }}
            placeholder="example.com atau .com"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "800" }}>Preset Dork Query:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              ["all", "Semua halaman"],
              ["upload", "inurl:upload"],
              ["admin", "inurl:admin"],
              ["pdf", "filetype:pdf"],
              ["api", "inurl:api"],
              ["php", "ext:php"],
            ].map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setSelectedDorkType(id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selectedDorkType === id ? ZRA.mint : ZRA.border,
                  backgroundColor: selectedDorkType === id ? ZRA.mintDim : ZRA.surfaceRaised,
                }}
              >
                <Text style={{ color: selectedDorkType === id ? ZRA.mint : ZRA.muted, fontSize: 11, fontWeight: "800" }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>
            {isTldWideScope
              ? "Cakupan TLD luas: hanya mencari halaman terindeks. Pemeriksaan HTTP aktif tidak dilakukan pada seluruh TLD."
              : "Pencarian pasif secara default. Pemeriksaan ringan hanya mengirim HEAD ke hasil dalam domain yang kamu konfirmasi; tidak menguji payload eksploit."}
          </Text>

          {!isTldWideScope ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmActiveScope }}
              onPress={() => setConfirmActiveScope((value) => !value)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: confirmActiveScope ? ZRA.mint : ZRA.border, backgroundColor: confirmActiveScope ? ZRA.mintDim : ZRA.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                {confirmActiveScope ? <Ionicons name="checkmark" size={15} color={ZRA.mint} /> : null}
              </View>
              <Text style={{ flex: 1, color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>
                Saya berwenang memeriksa domain ini dan subdomainnya. Izinkan pemeriksaan HTTP HEAD pada maksimal 10 hasil.
              </Text>
            </Pressable>
          ) : null}

          <PrimaryButton
            label={scanning ? "Dorking & Recon Berjalan..." : "Jalankan Dorking Pipeline"}
            icon="play-outline"
            onPress={handleRunDorkScan}
            disabled={scanning || !targetDomain.trim()}
          />

          {feedback ? (
            <Text style={{ color: feedback.includes("selesai") ? ZRA.mint : ZRA.amber, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
              {feedback}
            </Text>
          ) : null}
        </Panel>

        {scanning ? (
          <Panel style={{ gap: 8, backgroundColor: ZRA.surfaceRaised }}>
            <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800" }}>Scan Pipeline Status:</Text>
            {pipelineSteps.map((step, idx) => (
              <View key={step} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={scanStep > idx ? "checkmark-circle" : scanStep === idx + 1 ? "radio-button-on" : "ellipse-outline"} size={16} color={scanStep > idx ? ZRA.mint : scanStep === idx + 1 ? ZRA.amber : ZRA.muted} />
                <Text style={{ color: scanStep >= idx + 1 ? ZRA.text : ZRA.muted, fontSize: 11, fontWeight: scanStep === idx + 1 ? "800" : "500" }}>{step}</Text>
              </View>
            ))}
          </Panel>
        ) : null}

        {summary ? (
          <View style={{ gap: 14 }}>
            <SectionHeading label={`Hasil Output Dorking (${summary.modeLabel || "Pasif"})`} />
            <AuditWriteup report={summary} showStats={false} showResults={false} emptyMessage="Belum ada write-up dorking." />
            <Panel style={{ backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1, gap: 10, borderRadius: 14 }}>
              <Text selectable style={{ color: ZRA.mint, fontSize: 13, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                {summary.totalFound ?? 0} HALAMAN TERINDEKS untuk {summary.scopeLabel || targetDomain}
              </Text>

              <View style={{ gap: 4, marginTop: 4 }}>
                <Text style={{ color: ZRA.muted, fontSize: 10 }}>
                  {summary.activeCheckRequested
                    ? "Pemeriksaan HEAD membaca status dan header saja; ini bukan pemindaian eksploit atau konfirmasi kerentanan."
                    : "Hasil halaman pencarian publik; bukan daftar lengkap dan situs belum diperiksa langsung."}
                </Text>
              </View>
            </Panel>

            <SectionHeading label="Ringkasan Statistik &amp; URL Collector" />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View style={{ flex: 1, minWidth: 70, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.border, alignItems: "center" }}>
                <Text style={{ color: ZRA.mint, fontSize: 16, fontWeight: "900" }}>{summary.summary?.totalUrls ?? summary.totalFound ?? 0}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>Hasil</Text>
              </View>
              <View style={{ flex: 1, minWidth: 70, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.border, alignItems: "center" }}>
                <Text style={{ color: ZRA.blue, fontSize: 16, fontWeight: "900" }}>{summary.summary?.uniqueDomains ?? 0}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>Domains</Text>
              </View>
              <View style={{ flex: 1, minWidth: 70, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.amber, alignItems: "center" }}>
                <Text style={{ color: ZRA.amber, fontSize: 16, fontWeight: "900" }}>{summary.summary?.uploadCandidates ?? 0}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>Kandidat Upload</Text>
              </View>
              <View style={{ flex: 1, minWidth: 70, padding: 10, borderRadius: 12, backgroundColor: ZRA.surfaceRaised, borderWidth: 1, borderColor: ZRA.red, alignItems: "center" }}>
                <Text style={{ color: ZRA.red, fontSize: 16, fontWeight: "900" }}>{summary.summary?.vulnerabilities ?? 0}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>Findings</Text>
              </View>
            </View>

            {dorkResults.map((item, index) => (
              <View key={`${item.url}-${index}`} style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text selectable style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800", flex: 1 }}>{item.url}</Text>
                  <StatusPill label={item.assessmentStatus.toUpperCase()} tone={item.assessmentStatus === "vulnerable" ? "red" : "amber"} />
                </View>
                {item.istilah ? <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "700" }}>Kategori: {item.istilah}</Text> : null}
                {item.title ? <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "700" }}>{item.title}</Text> : null}
                <Text style={{ color: ZRA.muted, fontSize: 10 }}>Source: {item.source} · Query: {item.category} · HTTP {item.httpStatus ?? "belum diperiksa"}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 10 }}>Versi PHP: {item.phpVersion || "belum diperiksa"} · Server: {item.serverHeader || "belum diperiksa"}</Text>
                {Array.isArray(item.securityHeaderObservations) && item.securityHeaderObservations.length ? (
                  <Text style={{ color: ZRA.amber, fontSize: 10 }}>Header keamanan tidak terdeteksi: {item.securityHeaderObservations.join(", ")}</Text>
                ) : null}
                {item.activeCheckError ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>{item.activeCheckError}</Text> : null}
                {item.summary ? <Text style={{ color: ZRA.text, fontSize: 10, marginTop: 2 }}>{item.summary}</Text> : null}

                <Pressable
                  onPress={async () => {
                    try {
                      setFeedback(`Memeriksa live situs: ${item.url}...`);
                      const res = await fetch(`${apiUrl}/tools/dorking/inspect`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...websiteAuditHeaders },
                        body: JSON.stringify({ url: item.url }),
                      });
                      const inspection = await res.json();
                      item.httpStatus = inspection.httpStatus;
                      item.phpVersion = inspection.phpVersion;
                      item.vulnerabilityStatus = inspection.vulnerabilityStatus;
                      setFeedback(`Inspeksi sukses: HTTP ${inspection.httpStatus} · ${inspection.phpVersion}`);
                      setDorkResults([...dorkResults]);
                    } catch (e: any) {
                      setFeedback(`Gagal inspeksi situs: ${e.message}`);
                    }
                  }}
                  style={{ marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: ZRA.mintDim, alignItems: "center", borderWidth: 1, borderColor: ZRA.mint }}
                >
                  <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>🔍 Kunjungi &amp; Cek Situs (HTTP / PHP / Vulnerability)</Text>
                </Pressable>
                {item.vulnerabilityStatus ? (
                  <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "700", marginTop: 4 }}>Status Live: {item.vulnerabilityStatus}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* RIWAYAT AUDIT DORKING */}
        <SectionHeading label="RIWAYAT DORKING" />
        <AuditHistoryList
          items={dorkHistory}
          emptyMessage="Belum ada riwayat audit dorking."
          clearLabel="Hapus Semua Riwayat Dorking"
          onClear={() => clearHistory("dorking")}
        />
      </ScrollView>
    </ScreenShell>
  );
}
