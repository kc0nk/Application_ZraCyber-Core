// Tujuan file: File layar tab aplikasi; menampilkan laporan.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { ApiKeyNotice, BrandHeader, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useAppState, HistoryItem } from "@/lib/app-state";

export default function ReportsScreen() {
  const { ZRA, styles } = useZraTheme();
  const { hasDesktopApi, history, clearHistory } = useAppState();

  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const currentDate = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const aiAuthorName = "ZraCore AI Cyber Intelligence Core v3.0";

  if (!hasDesktopApi) {
    return <ApiKeyNotice locationRequired={false} />;
  }

  const allHistoryItems: HistoryItem[] = history || [];

  const handleExportPdf = async () => {
    if (allHistoryItems.length === 0) {
      setFeedback("Belum ada riwayat audit untuk dicetak.");
      return;
    }

    setExporting(true);
    setFeedback("Menyiapkan dokumen PDF Laporan Resmi ZraCore...");

    try {
      const itemsHtml = allHistoryItems.map((item, idx) => {
        const title = item.title || "Audit Item";
        const subtitle = item.subtitle || "";
        const date = new Date(item.createdAt).toLocaleString("id-ID");
        const res: any = item.result || {};

        let detailsHtml = "";

        // OSINT Dossier Details
        if (res.visualIntelligence) {
          const entities = res.visualIntelligence.detected_entities?.join(", ") || title;
          const summary = res.visualIntelligence.geolocation?.formatted_address || res.summary || "";
          const matches = res.visualIntelligence.google_search_matches || [];

          detailsHtml = `
            <div class="section-title">DOSSIER INTELIJEN OSINT & JEJAK DIGITAL</div>
            <p><strong>Target Entitas:</strong> ${entities}</p>
            <div class="summary-box"><strong>Sintesis Intelijen AI:</strong><br/>${summary.replace(/\n/g, "<br/>")}</div>
            ${matches.length > 0 ? `
              <div class="section-title">TAUTAN PROFIL & REKON TERDETEKSI (${matches.length})</div>
              <table>
                <thead><tr><th>No</th><th>Platform / Sumber</th><th>URL Direct Link</th></tr></thead>
                <tbody>
                  ${matches.map((m: any, i: number) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td><strong>${m.title || m.platform || "Social Profile"}</strong></td>
                      <td><a href="${m.url}" target="_blank">${m.url}</a></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            ` : ""}
          `;
        }
        // Findings / Vulnerabilities List
        else if (res.vulnerabilities || res.findings) {
          const list = res.vulnerabilities || res.findings || [];
          detailsHtml = `
            <div class="section-title">TEMUAN & OBSERVASI KEAMANAN (${list.length})</div>
            ${list.map((f: any, i: number) => `
              <div class="finding-card">
                <div class="finding-header">
                  <strong>${i + 1}. ${f.title || f.check || "Temuan Keamanan"}</strong>
                  <span class="badge ${ (f.severity || "info").toLowerCase() }">${(f.severity || "INFO").toUpperCase()}</span>
                </div>
                <p style="margin: 4px 0;">${f.summary || f.detail || ""}</p>
                ${f.pocCode || f.poc ? `<code>PoC: ${f.pocCode || f.poc}</code>` : ""}
                ${f.recommendation || f.remediationPatch ? `<p style="font-size: 9px; color: #047857; margin-top: 4px;"><strong>Rekomendasi:</strong> ${f.recommendation || f.remediationPatch}</p>` : ""}
              </div>
            `).join("")}
          `;
        }
        // Cryptography Details
        else if (res.cryptoResult) {
          const enc = res.cryptoResult.encrypt;
          const dec = res.cryptoResult.decrypt;
          detailsHtml = `
            <div class="section-title">KALKULASI KRIPTOGRAFI AES-256-GCM</div>
            ${enc ? `
              <p><strong>Ciphertext:</strong> <code>${enc.chipertext}</code></p>
              <p><strong>Parameter:</strong> ${enc.parameter}</p>
            ` : ""}
            ${dec ? `
              <p><strong>Plaintext Terbuka:</strong> <code>${dec.plaintext}</code></p>
            ` : ""}
          `;
        } else if (res.summary) {
          detailsHtml = `<p>${res.summary}</p>`;
        }

        return `
          <div class="report-block">
            <div class="block-header">
              <span class="block-number">AUDIT #${allHistoryItems.length - idx}</span>
              <span class="block-title">${title}</span>
              <span class="block-date">${date}</span>
            </div>
            <p style="font-size: 10px; color: #475569; margin: 2px 0 8px 0;">Sub: ${subtitle}</p>
            ${detailsHtml}
          </div>
        `;
      }).join("");

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>ZRACORE OFFICIAL SECURITY AUDIT REPORT</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #0f172a; background: #ffffff; line-height: 1.5; }
              .header { text-align: center; border-bottom: 3px double #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
              .header h1 { font-size: 20px; color: #0369a1; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px; }
              .header p { font-size: 10px; color: #64748b; margin: 0; }
              .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
              .meta-table td { padding: 8px 12px; font-size: 10px; border-bottom: 1px solid #f1f5f9; }
              .report-block { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
              .block-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px; }
              .block-number { font-size: 9px; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; }
              .block-title { font-size: 13px; font-weight: bold; color: #0f172a; }
              .block-date { font-size: 9px; color: #64748b; }
              .section-title { font-size: 10px; font-weight: bold; color: #0369a1; text-transform: uppercase; margin: 10px 0 6px 0; border-bottom: 1px solid #bae6fd; padding-bottom: 2px; }
              .summary-box { background: #f0f9ff; border-left: 3px solid #0284c7; padding: 8px 10px; font-size: 10px; color: #1e293b; margin: 6px 0; border-radius: 0 4px 4px 0; }
              .finding-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
              .finding-header { display: flex; justify-content: space-between; align-items: center; }
              .badge { padding: 2px 6px; font-size: 8px; font-weight: bold; border-radius: 4px; color: #fff; text-transform: uppercase; }
              .badge.critical { background: #dc2626; }
              .badge.high { background: #ea580c; }
              .badge.medium { background: #d97706; }
              .badge.low { background: #059669; }
              .badge.info { background: #0284c7; }
              table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9px; }
              th { background: #f1f5f9; text-align: left; padding: 6px; border: 1px solid #cbd5e1; color: #334155; }
              td { padding: 6px; border: 1px solid #e2e8f0; word-break: break-all; }
              a { color: #0284c7; text-decoration: none; }
              code { background: #f1f5f9; padding: 2px 5px; font-size: 9px; font-family: monospace; color: #b45309; word-break: break-all; display: inline-block; border-radius: 3px; }
              .footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ZRACORE OFFICIAL CYBER SECURITY AUDIT REPORT</h1>
              <p>Laporan Resmi Intelijen Keamanan Cyber & Penetration Testing Multi-Tool</p>
            </div>

            <table class="meta-table">
              <tr>
                <td><strong>Tanggal Laporan:</strong> ${currentDate}</td>
                <td><strong>Total Modul Audit:</strong> ${allHistoryItems.length} Riwayat</td>
              </tr>
              <tr>
                <td><strong>Mesin Auditor:</strong> ${aiAuthorName}</td>
                <td><strong>Status Verifikasi:</strong> Laporan Resmi Terverifikasi</td>
              </tr>
            </table>

            <h2 style="font-size: 13px; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-bottom: 14px;">RINCIAN SELURUH MODUL AUDIT & INTELIJEN</h2>

            ${itemsHtml}

            <div class="footer">
              <p>Laporan ini disusun secara otomatis oleh ZraCore AI Cyber Intelligence Orchestrator. Kerahasiaan dan integritas data terjamin.</p>
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        }
        setFeedback("Jendela cetak PDF terbuka.");
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Unduh Laporan Resmi ZraCore (PDF)" });
          setFeedback("PDF Laporan Resmi berhasil diunduh.");
        } else {
          setFeedback(`PDF disimpan di: ${uri}`);
        }
      }
    } catch (err: any) {
      setFeedback(`Gagal membuat PDF: ${err?.message || "Error"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25, gap: 14 }}>
        <BrandHeader
          eyebrow="ZRACORE / REPORTS"
          title="Laporan Audit."
          subtitle="Unduh ringkasan temuan keamanan sistem."
        />

        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text" size={18} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>TOTAL AUDIT: {allHistoryItems.length} ITEM</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11 }}>Web, App, File, OSINT, VPS &amp; Cryptography</Text>
              </View>
            </View>
            <StatusPill label="READY" tone="mint" />
          </View>
        </Panel>

        <Panel style={{ gap: 10 }}>
          <PrimaryButton
            label={exporting ? "Menyusun PDF..." : "Cetak & Unduh Laporan Resmi (PDF)"}
            icon="download-outline"
            onPress={() => void handleExportPdf()}
            disabled={exporting || allHistoryItems.length === 0}
          />
          <SecondaryButton
            label="Hapus Semua Riwayat Laporan"
            icon="trash-outline"
            onPress={() => clearHistory()}
          />
          {feedback ? (
            <Text style={{ color: feedback.includes("berhasil") || feedback.includes("terbuka") ? ZRA.mint : ZRA.amber, fontSize: 11, fontWeight: "700", textAlign: "center" }}>
              {feedback}
            </Text>
          ) : null}
        </Panel>

        {/* PRATINJAU DOKUMEN & RINCIAN SELURUH TOOL */}
        <SectionHeading label="Pratinjau Seluruh Riwayat Tool &amp; Hasil" />
        {allHistoryItems.length === 0 ? (
          <Panel>
            <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
              Belum ada riwayat audit dari tool mana pun. Silakan jalankan pemindaian di menu Ringkasan.
            </Text>
          </Panel>
        ) : (
          allHistoryItems.map((item, idx) => {
            const res: any = item.result || {};
            const matches = res.visualIntelligence?.google_search_matches || [];
            const summaryText = res.visualIntelligence?.geolocation?.formatted_address || res.summary || "";

            return (
              <Panel key={item.id || idx} style={{ gap: 10, backgroundColor: ZRA.surfaceRaised }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>AUDIT #{allHistoryItems.length - idx}</Text>
                  <StatusPill label={(item.status || "completed").toUpperCase()} tone="mint" />
                </View>

                <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>{item.title}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11 }}>{item.subtitle} · {new Date(item.createdAt).toLocaleString("id-ID")}</Text>

                {summaryText ? (
                  <View style={{ backgroundColor: ZRA.surface, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: ZRA.border }}>
                    <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "800", marginBottom: 4 }}>RINGKASAN INTELIJEN / TEMUAN:</Text>
                    <MarkdownRenderer content={summaryText} textColor={ZRA.text} codeColor={ZRA.mint} fontSize={11} />
                  </View>
                ) : null}

                {matches.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "800" }}>TAUTAN REFERENSI TERDETEKSI ({matches.length}):</Text>
                    {matches.slice(0, 5).map((m: any, i: number) => (
                      <Text key={i} selectable style={{ color: ZRA.mint, fontSize: 10, textDecorationLine: "underline" }}>
                        • {m.title || m.platform}: {m.url}
                      </Text>
                    ))}
                    {matches.length > 5 ? (
                      <Text style={{ color: ZRA.muted, fontSize: 9, fontStyle: "italic" }}>+ {matches.length - 5} tautan lainnya di PDF</Text>
                    ) : null}
                  </View>
                ) : null}
              </Panel>
            );
          })
        )}
      </ScrollView>
    </ScreenShell>
  );
}
