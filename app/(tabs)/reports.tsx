// Tujuan file: File layar tab aplikasi; menampilkan laporan.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BrandHeader, Panel, PrimaryButton, SecondaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { AuditWriteup } from "@/components/audit-writeup";
import { useAppState, HistoryItem } from "@/lib/app-state";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const snapCodeHtml = (title: string, language: string, value: unknown) => {
  const code = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!code) return "";
  return `<section class="snap-code"><header><i></i><i></i><i></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(language)}</span></header><pre>${escapeHtml(code)}</pre></section>`;
};

export default function ReportsScreen() {
  const { ZRA, styles } = useZraTheme();
  const { history, clearHistory } = useAppState();

  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const currentDate = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const aiAuthorName = "ZraCore AI Cyber Intelligence Core v3.0";

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
        const title = escapeHtml(item.title || "Audit Item");
        const subtitle = escapeHtml(item.subtitle || "");
        const date = escapeHtml(new Date(item.createdAt).toLocaleString("id-ID"));
        const res: any = item.result || {};
        const findings: any[] = Array.isArray(res.vulnerabilities) ? res.vulnerabilities : Array.isArray(res.findings) ? res.findings : [];
        const findingsHtml = findings.length ? `<div class="section-title">WRITE-UP · TEMUAN (${findings.length})</div>${findings.map((finding: any, i: number) => {
          const evidence = finding.pocCode || finding.pocSnippet || finding.poc || finding.code || finding.command || finding.evidence || finding.location || finding.endpoint || { check: finding.check || "Observasi" };
          return `<article class="finding-card"><strong>${i + 1}. ${escapeHtml(finding.title || finding.check || "Observasi")}</strong><p>${escapeHtml(finding.summary || finding.detail || finding.description || "")}</p>${finding.impact ? `<p><b>Dampak:</b> ${escapeHtml(finding.impact)}</p>` : ""}${finding.recommendation || finding.remediation || finding.remediationPatch ? `<p><b>Rekomendasi:</b> ${escapeHtml(finding.recommendation || finding.remediation || finding.remediationPatch)}</p>` : ""}${snapCodeHtml("Bukti / kode terkait", finding.language || "text", evidence)}</article>`;
        }).join("")}` : "";
        const matches: any[] = res.visualIntelligence?.google_search_matches || [];
        const linksHtml = matches.length ? `<div class="section-title">TAUTAN REFERENSI (${matches.length})</div>${matches.map((match: any) => `<p>${escapeHtml(match.title || match.platform || "Referensi")}: ${escapeHtml(match.url || "")}</p>`).join("")}` : "";
        const imageMatches: any[] = Array.isArray(res.imageMatches) ? res.imageMatches : [];
        const imageMatchesHtml = imageMatches.length ? `<div class="section-title">KECOCOKAN GOOGLE LENS (${imageMatches.length})</div>${imageMatches.map((match: any, i: number) => `<article class="finding-card"><strong>${i + 1}. ${escapeHtml(match.title || "Kecocokan visual")}</strong>${match.summary ? `<p>${escapeHtml(match.summary)}</p>` : ""}${match.url ? snapCodeHtml("Referensi", "url", match.url) : ""}</article>`).join("")}` : "";
        const urls: any[] = Array.isArray(res.urls) ? res.urls : [];
        const resultsHtml = urls.length ? `<div class="section-title">HASIL TERKAIT (${urls.length})</div>${urls.slice(0, 50).map((entry: any, i: number) => `<article class="finding-card"><strong>${i + 1}. ${escapeHtml(entry.title || "Hasil")}</strong>${entry.url ? snapCodeHtml("Referensi", "url", entry.url) : ""}<p>HTTP ${escapeHtml(entry.httpStatus ?? "Belum diperiksa")} · PHP ${escapeHtml(entry.phpVersion || "tidak diumumkan")} · Server ${escapeHtml(entry.serverHeader || "tidak diumumkan")}</p>${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ""}${entry.evidence ? snapCodeHtml("Bukti hasil", "json", entry.evidence) : ""}</article>`).join("")}` : "";
        const summary = res.visualIntelligence?.geolocation?.formatted_address || res.summary;
        const summaryHtml = typeof summary === "string" ? `<div class="summary-box"><strong>WRITE-UP · RINGKASAN</strong><br/>${escapeHtml(summary).replace(/\n/g, "<br/>")}</div>` : summary && typeof summary === "object" ? snapCodeHtml("Ringkasan statistik", "json", summary) : "";
        const query = res.searchQuery || res.query;
        const extraCode = [res.evidence ? snapCodeHtml("Bukti teknis", "json", res.evidence) : "", res.codeSamples ? snapCodeHtml("Kode terkait audit", "code", res.codeSamples) : "", Array.isArray(res.logs) && res.logs.length ? snapCodeHtml("Log audit", "log", res.logs.join("\n")) : "", res.output ? snapCodeHtml("Output teknis", "text", res.output) : ""].join("");
        const crypto = res.cryptoResult ? snapCodeHtml("Hasil kriptografi", "json", res.cryptoResult) : "";
        const detailsHtml = `${summaryHtml}${query ? snapCodeHtml("Query audit", "query", query) : ""}${findingsHtml}${resultsHtml}${linksHtml}${imageMatchesHtml}${crypto}${extraCode}`;

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
              .snap-code { overflow: hidden; margin: 7px 0; border: 1px solid #273449; border-radius: 7px; background: #0b1020; color: #d1fae5; page-break-inside: avoid; }
              .snap-code header { display: flex; align-items: center; gap: 5px; min-height: 25px; padding: 0 8px; border-bottom: 1px solid #202b3d; background: #111827; color: #cbd5e1; font-size: 8px; }
              .snap-code header i { width: 6px; height: 6px; border-radius: 50%; background: #fb7185; }
              .snap-code header i:nth-child(2) { background: #fbbf24; } .snap-code header i:nth-child(3) { background: #34d399; }
              .snap-code header strong { margin-left: 4px; flex: 1; }
              .snap-code header span { color: #6ee7b7; text-transform: uppercase; }
              .snap-code pre { margin: 0; padding: 8px; color: #d1fae5; font: 8px/1.5 Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
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
            return (
              <Panel key={item.id || idx} style={{ gap: 10, backgroundColor: ZRA.surfaceRaised }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>AUDIT #{allHistoryItems.length - idx}</Text>
                  <StatusPill label={(item.status || "completed").toUpperCase()} tone="mint" />
                </View>

                <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>{item.title}</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11 }}>{item.subtitle} · {new Date(item.createdAt).toLocaleString("id-ID")}</Text>

                <AuditWriteup report={res} emptyMessage="Detail write-up tidak tersedia untuk laporan ini." />
              </Panel>
            );
          })
        )}
      </ScrollView>
    </ScreenShell>
  );
}
