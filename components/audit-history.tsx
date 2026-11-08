// Tujuan file: Menampilkan riwayat semua tool dan membuka detail laporan tersimpan.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Panel, SecondaryButton, StatusPill, useZraTheme } from "@/components/zra-ui";
import type { HistoryItem } from "@/lib/app-state";

export type AuditToolCategory = "website" | "app" | "file" | "osint" | "crypto" | "vps" | "security";

const CATEGORY_MATCHERS: Record<AuditToolCategory, { actions: string[]; titles: string[] }> = {
  website: { actions: ["ai_pentest_audit", "scan_web_metadata"], titles: ["website", "pentest", "web audit"] },
  app: { actions: ["scan_app_deep", "scan_apk_mobile", "aggressive_apk_scan"], titles: ["app audit", "apk", "binary inspection"] },
  file: { actions: ["scan_file_deep", "scan_file"], titles: ["file", "berkas", "malware"] },
  osint: { actions: ["scan_osint"], titles: ["osint", "recon", "foto"] },
  crypto: { actions: ["scan_crypto"], titles: ["crypto", "cryptography", "kriptografi"] },
  vps: { actions: ["scan_vps"], titles: ["vps", "server inspection", "inspeksi server"] },
  security: { actions: ["device_security_scan"], titles: [] },
};

export function filterAuditHistory(items: HistoryItem[], category: AuditToolCategory) {
  const matcher = CATEGORY_MATCHERS[category];
  return items.filter((item) => {
    const action = String(item.payload?.action || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    if (category === "security" && (title.includes("website") || title.includes("pentest") || action.includes("ai_pentest"))) return false;
    return matcher.actions.includes(action) || matcher.titles.some((keyword) => title.includes(keyword)) || (category === "crypto" && item.kind === "CRYPTO");
  });
}

type AuditHistoryListProps = {
  items: HistoryItem[];
  emptyMessage: string;
  clearLabel: string;
  onClear: () => void;
};

function renderReport(result: HistoryItem["result"] | Record<string, any> | undefined, ZRA: ReturnType<typeof useZraTheme>["ZRA"]) {
  if (!result) {
    return <Text style={{ color: ZRA.muted, fontSize: 11 }}>Riwayat ini hanya menyimpan judul dan status, tanpa detail laporan.</Text>;
  }

  const report = result as Record<string, any>;
  const findings = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : Array.isArray(report.findings) ? report.findings : [];
  const stats = report.stats;
  const metadata = report.file;
  const record = report.record;
  const deviceScan = report.deviceScan;
  const hasVisibleReport = Boolean(
    report.summary || report.output || findings.length || report.pages?.length || report.logs?.length || stats || metadata || record || report.aiAnalysis || report.cryptoResult || report.dossier || deviceScan
  );

  if (!hasVisibleReport) {
    return <Text style={{ color: ZRA.muted, fontSize: 11 }}>Detail laporan tidak tersedia pada riwayat ini.</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      {report.scanType ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Jenis audit: {report.scanType}</Text> : null}
      {report.summary ? <MarkdownRenderer content={report.summary} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={12} /> : null}
      {report.output ? <MarkdownRenderer content={String(report.output)} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={11} /> : null}
      {report.limitations ? <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>{String(report.limitations)}</Text> : null}

      {deviceScan ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "900" }}>INVENTAR PRIVASI PERANGKAT · {deviceScan.installedPackageCount} paket terpasang</Text>
          {([[
            "Aplikasi meminta izin kamera/mikrofon", deviceScan.appsWithSensitivePermissions,
          ], ["Layanan Accessibility aktif", deviceScan.activeAccessibilityServices], ["Notification listener aktif", deviceScan.activeNotificationListeners], ["Device admin aktif", deviceScan.activeDeviceAdmins]] as [string, any[]][]).map(([label, entries]) => (
            <View key={label} style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 5 }}>
              <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>{label} ({entries?.length || 0})</Text>
              {entries?.length ? entries.map((entry: any, index: number) => (
                <Text key={`${entry.packageName}-${index}`} selectable style={{ color: ZRA.muted, fontSize: 9, lineHeight: 14 }}>
                  • {entry.appName || entry.packageName} ({entry.packageName}){entry.serviceName ? ` · ${entry.serviceName}` : ""}{entry.microphoneRequested || entry.cameraRequested ? ` · Mic ${entry.microphoneGranted ? "diizinkan" : "tidak diizinkan"} · Kamera ${entry.cameraGranted ? "diizinkan" : "tidak diizinkan"}` : ""}{entry.isSystemApp ? " · aplikasi sistem" : " · aplikasi pengguna"}
                </Text>
              )) : <Text style={{ color: ZRA.muted, fontSize: 9 }}>Tidak ada yang terdaftar.</Text>}
            </View>
          ))}
          <Text style={{ color: ZRA.muted, fontSize: 9, lineHeight: 14 }}>Izin atau layanan aktif adalah sinyal untuk ditinjau, bukan bukti perekaman atau malware.</Text>
        </View>
      ) : null}

      {stats ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {([
            ["Critical", stats.critical, ZRA.red],
            ["High", stats.high, ZRA.amber],
            ["Medium", stats.medium, ZRA.amber],
            ["Low", stats.low, ZRA.mint],
            ["Info", stats.info, ZRA.blue],
          ] as const).map(([label, count, color]) => (
            <View key={label} style={{ flexGrow: 1, minWidth: 52, padding: 7, borderRadius: 8, borderWidth: 1, borderColor: color, alignItems: "center", backgroundColor: ZRA.surface }}>
              <Text style={{ color, fontSize: 14, fontWeight: "900" }}>{count || 0}</Text>
              <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {metadata ? (
        <View style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 3 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>DETAIL FILE</Text>
          <Text style={{ color: ZRA.muted, fontSize: 10 }}>Nama: {metadata.name || "-"} · Ukuran: {metadata.size ?? "-"} byte</Text>
          {metadata.sha256 ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>SHA-256: {metadata.sha256}</Text> : null}
        </View>
      ) : null}

      {record ? (
        <View style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 4 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>DETAIL PEMERIKSAAN</Text>
          {record.authMode ? <Text style={{ color: ZRA.muted, fontSize: 10 }}>Mode akses: {record.authMode} · Status: {record.authStatus || "-"}</Text> : null}
          {record.paths?.length ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Path: {record.paths.join(", ")}</Text> : null}
          {record.sessions?.map((session: any, index: number) => (
            <Text key={`${session.name || "session"}-${index}`} style={{ color: ZRA.muted, fontSize: 9 }}>
              Cookie {session.name || session.source || index + 1}: Secure {session.secure ? "ya" : "tidak"}, HttpOnly {session.httpOnly ? "ya" : "tidak"}, SameSite {session.sameSite || "-"}
            </Text>
          ))}
        </View>
      ) : null}

      {report.aiAnalysis ? (
        <Text style={{ color: ZRA.muted, fontSize: 10 }}>
          Analisis AI: {report.aiAnalysis.provider || "-"} {report.aiAnalysis.model || ""} · {report.aiAnalysis.status || "-"}
          {report.aiAnalysis.message ? ` · ${report.aiAnalysis.message}` : ""}
        </Text>
      ) : null}

      {Array.isArray(report.pages) && report.pages.length ? (
        <View style={{ gap: 7 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "900" }}>HALAMAN YANG DIPERIKSA</Text>
          {report.pages.map((page: any, index: number) => (
            <View key={`${page.url || "page"}-${index}`} style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 3 }}>
              <Text selectable style={{ color: ZRA.mint, fontSize: 10, fontWeight: "700" }}>{page.title || page.url || `Halaman ${index + 1}`}</Text>
              {page.title && page.url ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>{page.url}</Text> : null}
              <Text style={{ color: ZRA.muted, fontSize: 9 }}>HTTP {page.status ?? "-"} · {page.links ?? 0} tautan · {page.forms ?? 0} form</Text>
              {page.responseHeaders ? Object.entries(page.responseHeaders).map(([name, value]) => (
                <Text key={name} selectable style={{ color: ZRA.muted, fontSize: 8 }}>{name}: {String(value)}</Text>
              )) : null}
            </View>
          ))}
        </View>
      ) : null}

      {Array.isArray(report.logs) && report.logs.length ? (
        <View style={{ padding: 10, borderRadius: 8, backgroundColor: "#060a0f", gap: 4 }}>
          <Text style={{ color: ZRA.mint, fontSize: 9, fontWeight: "900" }}>LOG AUDIT</Text>
          {report.logs.map((line: string, index: number) => <Text key={`${index}-${line}`} selectable style={{ color: "#34d399", fontSize: 9, lineHeight: 14, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{line}</Text>)}
        </View>
      ) : null}

      {findings.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "900" }}>TEMUAN / OBSERVASI</Text>
          {findings.map((finding: any, index: number) => {
            const title = finding.title || finding.check || `Temuan ${index + 1}`;
            const severity = String(finding.severity || "info").toUpperCase();
            const detail = finding.summary || finding.detail || finding.description || "";
            const severityTone = ["CRITICAL", "HIGH"].includes(severity) ? "red" : severity === "MEDIUM" ? "amber" : "mint";
            return (
              <View key={`${title}-${index}`} style={{ padding: 11, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800", flex: 1 }}>{index + 1}. {title}</Text>
                  <StatusPill label={severity} tone={severityTone} />
                </View>
                {finding.status ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Status: {finding.status}</Text> : null}
                {finding.category || finding.check ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Pemeriksaan: {finding.category || finding.check}</Text> : null}
                {finding.endpoint || finding.location ? <Text selectable style={{ color: ZRA.mint, fontSize: 9, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{finding.endpoint || finding.location}</Text> : null}
                {detail ? <MarkdownRenderer content={detail} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={10} /> : null}
                {finding.impact ? <Text style={{ color: ZRA.muted, fontSize: 10 }}>Dampak: {finding.impact}</Text> : null}
                {finding.recommendation || finding.remediation ? <Text style={{ color: ZRA.mint, fontSize: 10 }}>Saran: {finding.recommendation || finding.remediation}</Text> : null}
                {finding.ai ? <MarkdownRenderer content={[finding.ai.explanation, finding.ai.impact, finding.ai.safeValidation, finding.ai.remediation].filter(Boolean).join("\n\n")} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={10} /> : null}
                {finding.references?.map((reference: any, referenceIndex: number) => <Text key={`${reference.url || reference.label}-${referenceIndex}`} selectable style={{ color: ZRA.blue, fontSize: 9 }}>{reference.label || reference.url}</Text>)}
                {finding.pocCode || finding.poc ? <Text selectable style={{ color: ZRA.amber, fontSize: 9, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>PoC: {finding.pocCode || finding.poc}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {report.cryptoResult || report.dossier ? (
        <MarkdownRenderer content={JSON.stringify(report.cryptoResult || report.dossier, null, 2)} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={10} />
      ) : null}
    </View>
  );
}

export function AuditHistoryList({ items, emptyMessage, clearLabel, onClear }: AuditHistoryListProps) {
  const { ZRA } = useZraTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Panel style={{ gap: 10 }}>
      <SecondaryButton label={clearLabel} icon="trash-outline" onPress={onClear} />
      {items.length === 0 ? (
        <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 10 }}>{emptyMessage}</Text>
      ) : items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpandedId(expanded ? null : item.id)}
            style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: expanded ? ZRA.mint : ZRA.border, gap: 7 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800", flex: 1 }}>{item.title}</Text>
              <StatusPill label={item.status.toUpperCase()} tone={item.status === "completed" ? "mint" : "amber"} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: ZRA.muted, fontSize: 11, flex: 1 }}>{item.subtitle}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={ZRA.mint} />
            </View>
            {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: ZRA.border, paddingTop: 10 }}>{renderReport(item.result, ZRA)}</View> : null}
          </Pressable>
        );
      })}
    </Panel>
  );
}
