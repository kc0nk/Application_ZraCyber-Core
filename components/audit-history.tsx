// Tujuan file: Menampilkan riwayat semua tool dan membuka detail laporan tersimpan.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuditWriteup } from "@/components/audit-writeup";
import { Panel, SecondaryButton, StatusPill, useZraTheme } from "@/components/zra-ui";
import type { HistoryItem } from "@/lib/app-state";

export type AuditToolCategory = "website" | "app" | "file" | "osint" | "crypto" | "vps" | "security" | "dorking" | "phising";

const CATEGORY_MATCHERS: Record<AuditToolCategory, { actions: string[]; titles: string[] }> = {
  website: { actions: ["ai_pentest_audit", "scan_web_metadata"], titles: ["website", "pentest", "web audit"] },
  app: { actions: ["scan_app_deep", "scan_apk_mobile", "aggressive_apk_scan"], titles: ["app audit", "apk", "binary inspection"] },
  file: { actions: ["scan_file_deep", "scan_file"], titles: ["file", "berkas", "malware"] },
  osint: { actions: ["scan_osint"], titles: ["osint", "recon", "foto"] },
  crypto: { actions: ["scan_crypto"], titles: ["crypto", "cryptography", "kriptografi"] },
  vps: { actions: ["scan_vps"], titles: ["vps", "server inspection", "inspeksi server"] },
  security: { actions: ["device_security_scan"], titles: [] },
  dorking: { actions: ["dorking_recon"], titles: ["dorking", "dork"] },
  phising: { actions: ["phising_url_check"], titles: ["phishing check", "phising"] },
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

function renderReport(result: HistoryItem["result"] | Record<string, any> | undefined) {
  return <AuditWriteup report={result} emptyMessage="Detail laporan tidak tersedia pada riwayat ini." />;
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
            {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: ZRA.border, paddingTop: 10 }}>{renderReport(item.result)}</View> : null}
          </Pressable>
        );
      })}
    </Panel>
  );
}
