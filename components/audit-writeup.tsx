// Tujuan file: format write-up audit terpadu dengan blok bukti/kode bergaya SnapCode.
import { Image, Platform, ScrollView, Text, View } from "react-native";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Panel, StatusPill, useZraTheme } from "@/components/zra-ui";

type SnapCodeProps = { code: string; language?: string; title?: string };

export function SnapCode({ code, language = "text", title = "Bukti teknis" }: SnapCodeProps) {
  const { ZRA } = useZraTheme();
  if (!code) return null;
  const lines = code.split("\n");
  const mono = Platform.OS === "ios" ? "Menlo" : "monospace";

  return (
    <View style={{ overflow: "hidden", borderWidth: 1, borderColor: "#273449", borderRadius: 10, backgroundColor: "#0b1020" }}>
      <View style={{ minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: "#202b3d", backgroundColor: "#111827" }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#fb7185" }} />
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#fbbf24" }} />
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#34d399" }} />
        <Text numberOfLines={1} style={{ color: "#cbd5e1", marginLeft: 5, fontSize: 9, fontWeight: "700", flex: 1 }}>{title}</Text>
        <Text style={{ color: ZRA.mint, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }}>{language}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ flexDirection: "row", paddingVertical: 9, paddingRight: 12 }}>
          <Text selectable style={{ color: "#64748b", minWidth: 32, paddingHorizontal: 8, textAlign: "right", fontSize: 9, lineHeight: 16, fontFamily: mono }}>
            {lines.map((_, index) => String(index + 1).padStart(2, "0")).join("\n")}
          </Text>
          <Text selectable style={{ color: "#d1fae5", fontSize: 10, lineHeight: 16, fontFamily: mono }}>{code}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

type AuditWriteupProps = { report: any; emptyMessage?: string; showStats?: boolean; showResults?: boolean; maxResults?: number };

function jsonCode(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ""); }
}

function getFindingCode(finding: any) {
  const candidate = finding?.pocCode || finding?.pocSnippet || finding?.poc || finding?.code || finding?.command || finding?.snippet;
  if (typeof candidate === "string" && candidate.trim()) return { code: candidate, language: finding.language || "text", title: "Contoh teknis" };
  const evidence = finding?.evidence ?? finding?.location ?? finding?.endpoint;
  if (evidence != null) return { code: jsonCode({ evidence }), language: "json", title: "Bukti teknis" };
  return { code: jsonCode({ check: finding?.check || "Pemeriksaan", title: finding?.title || "Observasi" }), language: "json", title: "Detail pemeriksaan" };
}

export function AuditWriteup({ report, emptyMessage = "Belum ada hasil audit.", showStats = true, showResults = true, maxResults = 20 }: AuditWriteupProps) {
  const { ZRA } = useZraTheme();
  if (!report) return <Text style={{ color: ZRA.muted, fontSize: 11, textAlign: "center", paddingVertical: 10 }}>{emptyMessage}</Text>;

  const findings: any[] = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : Array.isArray(report.findings) ? report.findings : [];
  const urls: any[] = Array.isArray(report.urls) ? report.urls : Array.isArray(report.results) ? report.results : Array.isArray(report.places) ? report.places : [];
  const pages: any[] = Array.isArray(report.pages) ? report.pages : [];
  const reachablePageCount = typeof report.pageCount === "number" ? report.pageCount : pages.filter((page) => page.reachable).length;
  const visualMatches: any[] = Array.isArray(report.visualIntelligence?.google_search_matches)
    ? report.visualIntelligence.google_search_matches
    : Array.isArray(report.imageMatches) ? report.imageMatches : [];
  const visualSummary = report.visualIntelligence?.geolocation?.formatted_address;
  const summary = typeof report.summary === "string" ? report.summary : "";
  const logs: string[] = Array.isArray(report.logs) ? report.logs.map(String) : [];
  const stats = report.stats && typeof report.stats === "object" ? report.stats : null;
  const hasDetails = Boolean(summary || visualSummary || visualMatches.length || findings.length || urls.length || pages.length || report.evidence || report.output || report.searchQuery || report.query || report.file || report.authentication || report.authenticated || report.cryptoResult || report.dossier || report.stats || report.scanType || report.visualIntelligence || logs.length || (report.summary && typeof report.summary === "object"));

  if (!hasDetails) return <Text style={{ color: ZRA.muted, fontSize: 11, textAlign: "center", paddingVertical: 10 }}>{emptyMessage}</Text>;

  return (
    <View style={{ gap: 12 }}>
      {report.scanType ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Jenis audit: {String(report.scanType)}</Text> : null}
      {report.scanStatus === "unreachable" ? <View style={{ padding: 10, borderRadius: 9, borderWidth: 1, borderColor: ZRA.amber, backgroundColor: ZRA.surface }}>
        <Text style={{ color: ZRA.amber, fontSize: 10, fontWeight: "800" }}>SCAN TIDAK DIJALANKAN · TARGET TIDAK TERJANGKAU</Text>
      </View> : null}
      {summary ? <View style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 5 }}>
        <Text style={{ color: ZRA.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }}>WRITE-UP · RINGKASAN</Text>
        <MarkdownRenderer content={summary} textColor={ZRA.text} codeColor={ZRA.mint} fontSize={11} />
      </View> : null}
      {visualSummary ? <View style={{ padding: 12, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 5 }}>
        <Text style={{ color: ZRA.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }}>WRITE-UP · RINGKASAN LOKASI</Text>
        <Text selectable style={{ color: ZRA.text, fontSize: 11 }}>{String(visualSummary)}</Text>
      </View> : null}
      {report.summary && typeof report.summary === "object" && !Array.isArray(report.summary) ? <SnapCode code={jsonCode(report.summary)} language="json" title="Ringkasan statistik" /> : null}

      {report.authentication || report.authenticated ? <View style={{ padding: 10, borderRadius: 9, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.mint, gap: 4 }}>
        <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>{report.authenticated || report.authentication?.status === "authenticated" ? "Akses terautentikasi" : "Akses tanpa login"}{report.user ? ` · ${report.user}` : ""}</Text>
        {report.hostFingerprint ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Host fingerprint: {report.hostFingerprint}</Text> : null}
        {report.authentication?.loginPagePath ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Halaman login: {report.authentication.loginPagePath}</Text> : null}
      </View> : null}

      {showStats && stats ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {([ ["Critical", stats.critical, ZRA.red], ["High", stats.high, ZRA.amber], ["Medium", stats.medium, ZRA.amber], ["Low", stats.low, ZRA.mint], ["Info", stats.info, ZRA.blue] ] as [string, any, string][]).map(([label, value, color]) => (
          <View key={label} style={{ flexGrow: 1, minWidth: 52, padding: 7, borderRadius: 8, borderWidth: 1, borderColor: color, alignItems: "center", backgroundColor: ZRA.surface }}>
            <Text style={{ color, fontSize: 14, fontWeight: "900" }}>{value || 0}</Text>
            <Text style={{ color: ZRA.muted, fontSize: 8, fontWeight: "800" }}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View> : null}

      {report.file ? <View style={{ padding: 10, borderRadius: 9, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 3 }}>
        <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>ARTEFAK FILE</Text>
        <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Nama: {report.file.name || "-"} · Ukuran: {report.file.size ?? "-"} byte</Text>
        {report.file.sha256 ? <SnapCode code={String(report.file.sha256)} language="sha256" title="Hash file" /> : null}
      </View> : null}

      {report.searchQuery || report.query ? <SnapCode code={String(report.searchQuery || report.query)} language={report.category === "dorking" ? "google dork" : "query"} title="Query audit" /> : null}

      {findings.length ? <View style={{ gap: 9 }}>
        <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>WRITE-UP · TEMUAN ({findings.length})</Text>
        {findings.map((finding, index) => {
          const code = getFindingCode(finding);
          const severity = String(finding.severity || "info").toLowerCase();
          const tone = severity === "critical" || severity === "high" ? "red" : severity === "medium" ? "amber" : "mint";
          return <View key={`${finding.title || finding.check || "finding"}-${index}`} style={{ padding: 11, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: ZRA.text, flex: 1, fontSize: 12, fontWeight: "800" }}>{index + 1}. {finding.title || finding.check || "Observasi"}</Text>
              <StatusPill label={severity.toUpperCase()} tone={tone} />
            </View>
            {finding.summary || finding.detail || finding.description ? <MarkdownRenderer content={String(finding.summary || finding.detail || finding.description)} textColor={ZRA.muted} codeColor={ZRA.mint} fontSize={10} /> : null}
            {finding.impact ? <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>Dampak: {String(finding.impact)}</Text> : null}
            {finding.recommendation || finding.remediation || finding.remediationPatch ? <Text style={{ color: ZRA.mint, fontSize: 10, lineHeight: 15 }}>Rekomendasi: {String(finding.recommendation || finding.remediation || finding.remediationPatch)}</Text> : null}
            {finding.location || finding.endpoint ? <Text selectable style={{ color: ZRA.muted, fontSize: 9 }}>Lokasi: {String(finding.location || finding.endpoint)}</Text> : null}
            <SnapCode code={code.code} language={code.language} title={code.title} />
          </View>;
        })}
      </View> : null}

      {showResults && urls.length ? <View style={{ gap: 8 }}>
        <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>HASIL TERKAIT ({urls.length})</Text>
        {urls.slice(0, maxResults).map((entry, index) => (
          <View key={`${entry.url || entry.title || "result"}-${index}`} style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 5 }}>
            <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>{entry.title || `Hasil ${index + 1}`}</Text>
            {entry.thumbnail || entry.image ? <Image source={{ uri: entry.thumbnail || entry.image }} resizeMode="cover" style={{ width: "100%", height: 150, borderRadius: 8, backgroundColor: ZRA.surfaceRaised }} /> : null}
            {entry.url ? <SnapCode code={String(entry.url)} language="url" title="Referensi" /> : null}
            {entry.httpStatus != null ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>HTTP {String(entry.httpStatus)} · PHP {String(entry.phpVersion || "tidak diumumkan")} · Server {String(entry.serverHeader || "tidak diumumkan")}</Text> : null}
            {entry.summary ? <Text style={{ color: ZRA.muted, fontSize: 9, lineHeight: 14 }}>{String(entry.summary)}</Text> : null}
            {entry.evidence ? <SnapCode code={jsonCode(entry.evidence)} language="json" title="Bukti hasil" /> : null}
          </View>
        ))}
        {urls.length > maxResults ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>Menampilkan {maxResults} dari {urls.length} hasil.</Text> : null}
      </View> : null}

      {pages.length ? <View style={{ gap: 7 }}>
        <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>HALAMAN CRAWL ({reachablePageCount} berhasil dari {pages.length} alamat)</Text>
        {pages.slice(0, maxResults).map((page, index) => <SnapCode key={`${page.url || "page"}-${index}`} code={jsonCode(page)} language="json" title={page.title || page.url || `Halaman ${index + 1}`} />)}
      </View> : null}

      {visualMatches.length ? <View style={{ gap: 8 }}>
        <Text style={{ color: ZRA.text, fontSize: 11, fontWeight: "900" }}>REFERENSI OSINT ({visualMatches.length})</Text>
        {visualMatches.slice(0, maxResults).map((match, index) => <View key={`${match.url || "match"}-${index}`} style={{ padding: 9, borderRadius: 8, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 5 }}>
          <Text style={{ color: ZRA.text, fontSize: 10, fontWeight: "800" }}>{match.title || match.platform || `Referensi ${index + 1}`}</Text>
          {match.thumbnail || match.image ? <Image source={{ uri: match.thumbnail || match.image }} resizeMode="cover" style={{ width: "100%", height: 150, borderRadius: 8, backgroundColor: ZRA.surfaceRaised }} /> : null}
          {match.summary ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>{String(match.summary)}</Text> : null}
          {match.url ? <SnapCode code={String(match.url)} language="url" title="Tautan sumber" /> : null}
          {match.snippet ? <Text style={{ color: ZRA.muted, fontSize: 9 }}>{String(match.snippet)}</Text> : null}
        </View>)}
        <SnapCode code={jsonCode(visualMatches)} language="json" title="Data referensi OSINT" />
      </View> : null}

      {report.evidence ? <SnapCode code={jsonCode(report.evidence)} language="json" title="Bukti teknis yang dikumpulkan" /> : null}
      {report.codeSamples ? <SnapCode code={typeof report.codeSamples === "string" ? report.codeSamples : jsonCode(report.codeSamples)} language="code" title="Kode terkait audit" /> : null}
      {report.output ? <SnapCode code={String(report.output)} language="text" title="Output teknis" /> : null}
      {logs.length ? <SnapCode code={logs.join("\n")} language="log" title="Log audit" /> : null}
      {report.limitations ? <Text style={{ color: ZRA.muted, fontSize: 9, lineHeight: 14 }}>Batasan: {String(report.limitations)}</Text> : null}
    </View>
  );
}
