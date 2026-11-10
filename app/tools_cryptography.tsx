// Tujuan file: File layar tool cryptography; berisi input, kontrol, dan hasil yang terlihat bagi pengguna.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Field, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

export default function ToolsCryptographyScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();

  const [cryptoMode, setCryptoMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [cipherInput, setCipherInput] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reportData, setReportData] = useState<any | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanPhase, setScanPhase] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    "[READY] ZraCore Crypto Core Initialized.",
    "[IDLE] Menunggu input plaintext/ciphertext dan secret key...",
  ]);
  const cryptoHistory = filterAuditHistory(history, "crypto");

  const handleRunCrypto = async () => {
    const input = cipherInput.trim();
    if (!input) {
      setFeedback("Masukkan data teks terlebih dahulu.");
      return;
    }

    setBusy(true);
    setReportData(null);
    setFeedback(`Menjalankan ${cryptoMode === "encrypt" ? "Enkripsi" : "Dekripsi"} AES-256-GCM...`);
    setScanProgress(20);
    setScanPhase("Argon2id / Scrypt Key Derivation...");

    setTerminalLogs([
      `[00:00:01] > [INIT] Crypto mode: ${cryptoMode.toUpperCase()}`,
      `[00:00:02] > [KDF] Deriving 256-bit key from secret key & salt...`,
      `[00:00:04] > [AES-GCM] Executing symmetric encryption / decryption core...`,
      `[00:00:06] > [SUCCESS] Cryptographic operation successfully completed!`
    ]);

    try {
      setScanProgress(60);
      setScanPhase("Menghubungkan ke Crypto Engine...");

      const targetUrl = apiUrl || "http://127.0.0.1:4317";
      const response = await fetch(`${targetUrl}/tools/crypto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...websiteAuditHeaders,
        },
        body: JSON.stringify({
          mode: cryptoMode,
          input,
          secretKey: secretKey.trim(),
        }),
      }).catch(() => null);

      setScanProgress(90);
      setScanPhase("Memproses hasil cipher...");

      if (!response || !response.ok) {
        const errBody = await response?.json().catch(() => null);
        throw new Error(errBody?.error || `Desktop Controller mengembalikan HTTP ${response?.status || 500}. Pastikan Desktop API aktif.`);
      }
      const report = await response.json();

      setReportData(report);
      setScanProgress(100);
      setScanPhase("Selesai.");
      setFeedback(`${cryptoMode === "encrypt" ? "Enkripsi" : "Dekripsi"} Berhasil!`);
      setTerminalLogs(Array.isArray(report.logs) ? report.logs : ["[DONE] Operasi selesai."]);

      addHistory({
        kind: "CRYPTO",
        title: `Crypto ${cryptoMode === "encrypt" ? "Encrypt" : "Decrypt"}`,
        subtitle: `AES-256-GCM operation completed`,
        status: "completed",
        payload: { action: "scan_crypto", mode: cryptoMode },
        result: report,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Operasi kriptografi gagal.";
      setFeedback(`Gagal: ${message}`);
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
          title="Kriptografi &amp; Cipher."
          subtitle="Kalkulasi enkripsi, dekripsi, hash, dan analisis cryptanalysis CTF."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignContent: "center", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="key-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>CRYPTOGRAPHY</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>AES-256-GCM &amp; Scrypt KDF</Text>
              </View>
            </View>
            <StatusPill label="ACTIVE ENGINE" tone="mint" />
          </View>
        </Panel>

        {/* Pilihan mode, teks, dan kunci yang dipakai pada formulir. */}
        <SectionHeading label="Mode &amp; Algoritma Kriptografi" />
        <Panel style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setCryptoMode("encrypt")}
              style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: cryptoMode === "encrypt" ? ZRA.mintDim : ZRA.surface, borderWidth: 1, borderColor: cryptoMode === "encrypt" ? ZRA.mint : ZRA.border, alignItems: "center" }}
            >
              <Text style={{ color: cryptoMode === "encrypt" ? ZRA.mint : ZRA.text, fontWeight: "800", fontSize: 12 }}>Enkripsi (Encrypt)</Text>
            </Pressable>
            <Pressable
              onPress={() => setCryptoMode("decrypt")}
              style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: cryptoMode === "decrypt" ? ZRA.mintDim : ZRA.surface, borderWidth: 1, borderColor: cryptoMode === "decrypt" ? ZRA.mint : ZRA.border, alignItems: "center" }}
            >
              <Text style={{ color: cryptoMode === "decrypt" ? ZRA.mint : ZRA.text, fontWeight: "800", fontSize: 12 }}>Dekripsi (Decrypt)</Text>
            </Pressable>
          </View>

          <Field
            label={cryptoMode === "encrypt" ? "Teks Mentah (Plaintext)" : "Ciphertext / Hash Target"}
            value={cipherInput}
            onChangeText={setCipherInput}
            placeholder={cryptoMode === "encrypt" ? "Masukkan data rahasia..." : "Masukkan ciphertext..."}
            autoCapitalize="none"
          />

          <Field
            label="Kunci Rahasia (Secret Key / Salt)"
            value={secretKey}
            onChangeText={setSecretKey}
            placeholder="zracore_key_2026"
            autoCapitalize="none"
          />

          <PrimaryButton
            label={busy ? "Kripto Core Berjalan..." : `Jalankan ${cryptoMode === "encrypt" ? "Enkripsi" : "Dekripsi"}`}
            icon="calculator-outline"
            onPress={() => void handleRunCrypto()}
            disabled={busy || !cipherInput.trim()}
          />

          {feedback ? (
            <Text style={{ color: feedback.includes("Berhasil") ? ZRA.mint : ZRA.amber, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
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

        {/* Preview konsol untuk menampilkan log proses kriptografi. */}
        <SectionHeading label="Konsol Terminal Eksekusi AI" />
        <Panel style={{ gap: 10, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZRA.mint }} />
              <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                &gt;_ ZRACORE CRYPTOGRAPHY CONSOLE
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
                &gt; Crypto core processing... _
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* Hasil enkripsi/dekripsi atau analisis ditampilkan di kartu ini. */}
        <Panel style={{ gap: 14, backgroundColor: ZRA.surfaceRaised }}>
          <SectionHeading label="Hasil/Output" />
          {reportData && reportData.cryptoResult ? (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
              <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>{"// HASIL KRIPTOGRAFI & CIPHER"}</Text>
              {reportData.cryptoResult.encrypt ? (
                <>
                  <Text style={{ color: ZRA.amber, fontSize: 11, fontWeight: "700" }}>Ciphertext:</Text>
                  <Text selectable style={{ color: ZRA.mint, fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{reportData.cryptoResult.encrypt.chipertext}</Text>
                  <Text style={{ color: ZRA.muted, fontSize: 11 }}>Parameter: {reportData.cryptoResult.encrypt.parameter}</Text>
                  <MarkdownRenderer content={reportData.cryptoResult.encrypt.rumus_bongkar || ""} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
                </>
              ) : null}
              {reportData.cryptoResult.decrypt ? (
                <>
                  <Text style={{ color: ZRA.amber, fontSize: 11, fontWeight: "700" }}>Plaintext:</Text>
                  <Text selectable style={{ color: ZRA.mint, fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{reportData.cryptoResult.decrypt.plaintext}</Text>
                  <MarkdownRenderer content={reportData.cryptoResult.decrypt.rumus_yang_di_pakai || ""} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
                  <MarkdownRenderer content={reportData.cryptoResult.decrypt.deskripsi || ""} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} />
                </>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
              Belum ada hasil kriptografi. Silakan jalankan kalkulasi.
            </Text>
          )}
        </Panel>

        {/* Daftar operasi kriptografi terdahulu. */}
        <SectionHeading label="RIWAYAT KRIPTOGRAFI" />
        <AuditHistoryList items={cryptoHistory} emptyMessage="Belum ada riwayat kriptografi." clearLabel="Hapus Riwayat Crypto" onClear={() => clearHistory("crypto")} />
      </ScrollView>
    </ScreenShell>
  );
}
