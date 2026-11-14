// Tujuan file: pencarian OSINT publik melalui Google Search, Google Lens, dan Google Maps.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { BrandHeader, Field, Panel, PrimaryButton, ScreenShell, SectionHeading, StatusPill, useZraTheme } from "@/components/zra-ui";
import { AuditHistoryList, filterAuditHistory } from "@/components/audit-history";
import { useAppState } from "@/lib/app-state";

type SearchMode = "name" | "username" | "image" | "maps_image";
const IMAGE_MAX_BYTES = 500 * 1024;

export default function ToolsOsintScreen() {
  const router = useRouter();
  const { ZRA, styles } = useZraTheme();
  const { apiUrl, websiteAuditHeaders, history, addHistory, clearHistory } = useAppState();
  const [searchType, setSearchType] = useState<SearchMode>("name");
  const [target, setTarget] = useState("");
  const [selectedImage, setSelectedImage] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reportData, setReportData] = useState<any | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["[READY] SerpApi OSINT siap.", "[IDLE] Pilih mode pencarian."]);
  const osintHistory = filterAuditHistory(history, "osint");
  const baseUrl = apiUrl || "http://127.0.0.1:4317";

  const callApi = async (body: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/tools/osint`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", ...websiteAuditHeaders },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Desktop Controller mengembalikan HTTP ${response.status}.`);
    return data;
  };

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > IMAGE_MAX_BYTES) {
        setSelectedImage(null);
        setFeedback("Ukuran gambar maksimal 500 KB untuk Google Lens.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType || "")) {
        setSelectedImage(null);
        setFeedback("Pilih gambar JPG, PNG, atau WebP.");
        return;
      }
      setSelectedImage(asset);
      setReportData(null);
      setFeedback(`Gambar siap dicari: ${asset.name}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Gagal memilih gambar.");
    }
  };

  const handleRun = async () => {
    if ((searchType === "image" || searchType === "maps_image") && !selectedImage) {
      setFeedback("Pilih gambar terlebih dahulu.");
      return;
    }
    const value = target.trim();
    if (searchType !== "image" && searchType !== "maps_image" && !value) {
      setFeedback("Masukkan nama atau username yang dicari.");
      return;
    }

    setBusy(true);
    setReportData(null);
    setFeedback("Mengambil hasil publik dari SerpApi...");
    setTerminalLogs([`[START] ${searchType.toUpperCase()}`, "[SERPAPI] Mengirim pencarian ke Google..."]);
    try {
      let body: Record<string, unknown> = { searchType, target: value };
      let historyTarget = value;
      if ((searchType === "image" || searchType === "maps_image") && selectedImage) {
        const base64 = await FileSystem.readAsStringAsync(selectedImage.uri, { encoding: FileSystem.EncodingType.Base64 });
        if (base64.length * 0.75 > IMAGE_MAX_BYTES) throw new Error("Ukuran gambar maksimal 500 KB untuk Google Lens.");
        body = { searchType, imageBase64: base64, mimeType: selectedImage.mimeType, fileName: selectedImage.name };
        historyTarget = selectedImage.name;
      }
      const report = await callApi(body);
      setReportData(report);
      setTerminalLogs(Array.isArray(report.logs) ? report.logs : ["[DONE] Pencarian selesai."]);
      setFeedback(`Selesai. ${report.totalFound || 0} hasil ditemukan.`);
      addHistory({
        kind: "SCAN",
        title: `OSINT ${searchType}: ${historyTarget}`,
        subtitle: `${report.totalFound || 0} hasil publik`,
        status: "completed",
        payload: { action: "scan_osint", category: searchType },
        result: report,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pencarian OSINT gagal.";
      setFeedback(`Gagal menjalankan pencarian: ${message}`);
      setTerminalLogs((lines) => [...lines, `[ERROR] ${message}`]);
    } finally {
      setBusy(false);
    }
  };

  const handlePlacePhotos = async (place: any, nextPageToken?: string) => {
    if (!place?.dataId) {
      setFeedback("Google Maps tidak memberikan ID untuk tempat ini, jadi fotonya tidak bisa diminta.");
      return;
    }
    setBusy(true);
    setFeedback(`Mengambil foto publik untuk ${place.title}...`);
    try {
      const report = await callApi({ searchType: "maps_photos", dataId: place.dataId, placeTitle: place.title, nextPageToken });
      setReportData((current: any) => nextPageToken && current?.searchType === "maps_photos"
        ? { ...report, results: [...(current.results || []), ...(report.results || [])], urls: [...(current.urls || []), ...(report.urls || [])], totalFound: (current.totalFound || 0) + (report.totalFound || 0) }
        : report);
      setTerminalLogs(report.logs || []);
      setFeedback(`Selesai. ${report.totalFound || 0} foto ditemukan.`);
      if (!nextPageToken) {
        addHistory({
          kind: "SCAN",
          title: `OSINT foto Maps: ${place.title}`,
          subtitle: `${report.totalFound || 0} foto publik`,
          status: "completed",
          payload: { action: "scan_osint", category: "maps_photos" },
          result: report,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengambil foto Maps.";
      setFeedback(`Gagal mengambil foto: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleLensMapSearch = async (match: any) => {
    const query = String(match?.title || "").trim();
    if (!query) return;
    setBusy(true);
    setFeedback(`Mencari kandidat Google Maps dari “${query}”...`);
    try {
      const report = await callApi({ searchType: "maps_search", target: query });
      const mergedReport = {
        ...report,
        imageMatches: Array.isArray(reportData?.imageMatches) ? reportData.imageMatches : [],
        summary: `${report.summary || ""} Kueri berasal dari kecocokan Google Lens; pastikan tempatnya sesuai foto.`,
      };
      setReportData(mergedReport);
      setTerminalLogs(report.logs || []);
      setFeedback(`Selesai. ${report.totalFound || 0} kandidat Maps ditemukan; pilih tempat untuk melihat fotonya.`);
      addHistory({
        kind: "SCAN",
        title: `OSINT Maps dari Lens: ${query}`,
        subtitle: `${report.totalFound || 0} kandidat tempat`,
        status: "completed",
        payload: { action: "scan_osint", category: "maps_search_from_lens" },
        result: mergedReport,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pencarian Google Maps gagal.";
      setFeedback(`Gagal mencari kandidat Maps: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const searchModes: { id: SearchMode; label: string }[] = [
    { id: "name", label: "Nama lengkap" },
    { id: "username", label: "Username" },
    { id: "image", label: "Gambar Google" },
    { id: "maps_image", label: "Google Maps dari Foto" },
  ];
  const results: any[] = Array.isArray(reportData?.results) ? reportData.results : [];

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25, gap: 16 }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Ionicons name="arrow-back" size={20} color={ZRA.mint} />
          <Text style={{ color: ZRA.mint, fontSize: 13, fontWeight: "700" }}>Kembali ke Ringkasan</Text>
        </Pressable>
<<<<<<< HEAD
        <BrandHeader eyebrow="ZRACORE / TOOLKIT" title="OSINT" subtitle="Pencarian data publik melalui Google Search, Google Lens, dan Google Maps." />
=======

        <BrandHeader eyebrow="ZRACORE / TOOLKIT" title="OSINT" subtitle="Modul investigasi jejak digital faktual tanpa biografi spekulatif." />

>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8
        <Panel accent>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ZRA.mintDim, alignItems: "center", justifyContent: "center" }}>
<<<<<<< HEAD
                <Ionicons name="search-outline" size={20} color={ZRA.mint} />
=======
                <Ionicons name="people-outline" size={20} color={ZRA.mint} />
              </View>
              <View>
                <Text style={styles.panelTitle}>OSINT</Text>
                <Text style={{ color: ZRA.muted, fontSize: 11, fontWeight: "600" }}>Mode Faktual Tanpa Spekulasi</Text>
>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8
              </View>
              <View><Text style={styles.panelTitle}>OSINT Pencarian Publik</Text><Text style={{ color: ZRA.muted, fontSize: 11 }}>Hasil indeks Google melalui SerpApi</Text></View>
            </View>
<<<<<<< HEAD
            <StatusPill label="ACTIVE" tone="mint" />
          </View>
        </Panel>

        <SectionHeading label="Pilih Jenis Pencarian" />
        <Panel style={{ gap: 13 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {searchModes.map((mode) => (
              <Pressable key={mode.id} onPress={() => { setSearchType(mode.id); setFeedback(""); setReportData(null); }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: searchType === mode.id ? ZRA.mintDim : ZRA.surface, borderWidth: 1, borderColor: searchType === mode.id ? ZRA.mint : ZRA.border }}>
                <Text style={{ color: searchType === mode.id ? ZRA.mint : ZRA.text, fontSize: 11, fontWeight: "800" }}>{mode.label}</Text>
=======
            <StatusPill label="INTEL" tone="mint" />
          </View>
        </Panel>

        <SectionHeading label="Pilih Jenis Target &amp; Kata Kunci" />
        <Panel style={{ gap: 12 }}>
          {/* Mode Selector Buttons */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["name", "username", "email"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setSearchType(type)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: searchType === type ? "#2563eb" : ZRA.surface,
                  borderWidth: 1,
                  borderColor: searchType === type ? "#2563eb" : ZRA.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: searchType === type ? "#ffffff" : ZRA.text, fontSize: 11, fontWeight: "800" }}>
                  {type === "name" ? "Nama Lengkap" : type === "username" ? "@Username" : "Email"}
                </Text>
>>>>>>> 9348a6489ab663a6093a7c27b3ffcbc3092bc8e8
              </Pressable>
            ))}
          </View>
          {searchType === "image" || searchType === "maps_image" ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: ZRA.muted, fontSize: 11 }}>{searchType === "maps_image" ? "Unggah foto. AI membandingkan isi foto dengan hasil Google Lens untuk menyusun kueri tempat; SerpApi lalu mencari kandidat di Google Maps. Setelah itu pilih kandidat untuk melihat foto Maps." : "Google Lens mencari kecocokan visual dari gambar JPG, PNG, atau WebP (maksimal 500 KB)."}</Text>
              <Pressable onPress={() => void pickImage()} style={{ minHeight: 48, borderWidth: 1, borderColor: ZRA.border, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: ZRA.surface }}>
                <Ionicons name="image-outline" size={19} color={ZRA.mint} />
                <Text numberOfLines={1} style={{ color: ZRA.text, fontSize: 12, fontWeight: "700", flex: 1 }}>{selectedImage?.name || "Pilih gambar untuk Google Lens"}</Text>
              </Pressable>
            </View>
          ) : (
            <Field
              label={searchType === "name" ? "Nama lengkap" : "Username"}
              value={target}
              onChangeText={setTarget}
              placeholder={searchType === "name" ? "contoh: Budi Santoso" : "contoh: budisantoso"}
              autoCapitalize={searchType === "name" ? "words" : "none"}
            />
          )}
          <PrimaryButton label={busy ? "Mencari..." : searchType === "maps_image" ? "Cari Tempat dari Foto" : searchType === "image" ? "Cari Gambar dengan Google Lens" : "Cari di Google"} icon="search-outline" onPress={() => void handleRun()} disabled={busy || (searchType === "image" || searchType === "maps_image" ? !selectedImage : !target.trim())} />
          {feedback ? <Text style={{ color: feedback.startsWith("Selesai") ? ZRA.mint : feedback.startsWith("Gagal") ? ZRA.amber : ZRA.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{feedback}</Text> : null}
        </Panel>

        <SectionHeading label="Status Pencarian" />
        <Panel style={{ gap: 9, backgroundColor: "#060a0f", borderColor: ZRA.mint, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "900", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>&gt;_ SERPAPI OSINT</Text>
            <StatusPill label={busy ? "SEARCHING" : "IDLE"} tone={busy ? "amber" : "mint"} />
          </View>
          <View style={{ backgroundColor: "#000", padding: 12, borderRadius: 8, gap: 4 }}>
            {terminalLogs.map((line, index) => <Text key={`${index}-${line}`} selectable style={{ color: line.includes("ERROR") ? ZRA.amber : "#34d399", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{line}</Text>)}
          </View>
        </Panel>

        <SectionHeading label="Hasil Pencarian Publik" />
        <Panel style={{ gap: 13 }}>
          {reportData ? <>
            <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "800" }}>{reportData.summary || `${reportData.totalFound || 0} hasil ditemukan`}</Text>
            {reportData.searchQuery ? <Text selectable style={{ color: ZRA.muted, fontSize: 10 }}>Query: {reportData.searchQuery}</Text> : null}
            {reportData.aiReason ? <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>Alasan AI: {reportData.aiReason}</Text> : null}
            {Array.isArray(reportData.imageMatches) && reportData.imageMatches.length ? <View style={{ gap: 8 }}>
              <Text style={{ color: ZRA.amber, fontSize: 11, fontWeight: "800" }}>KECOCOKAN GOOGLE LENS YANG DITINJAU AI</Text>
              {reportData.imageMatches.slice(0, 5).map((match: any, index: number) => <View key={`${match.url}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 9, padding: 8, backgroundColor: ZRA.surface, borderRadius: 8 }}>
                {match.thumbnail ? <Image source={{ uri: match.thumbnail }} style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: ZRA.surfaceRaised }} /> : null}
                <View style={{ flex: 1, gap: 5 }}>
                  {match.url ? <Pressable onPress={() => void Linking.openURL(match.url)}><Text numberOfLines={2} style={{ color: ZRA.text, fontSize: 10 }}>{match.title}</Text></Pressable> : <Text numberOfLines={2} style={{ color: ZRA.text, fontSize: 10 }}>{match.title}</Text>}
                  {reportData.searchType === "maps_image" ? <Pressable onPress={() => void handleLensMapSearch(match)} disabled={busy} style={{ alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 7, backgroundColor: ZRA.mintDim }}><Text style={{ color: ZRA.mint, fontSize: 9, fontWeight: "800" }}>Cari tempat ini di Google Maps</Text></Pressable> : null}
                </View>
              </View>)}
            </View> : null}
            {results.length ? results.map((item, index) => (
              <View key={`${item.url || item.dataId || item.title}-${index}`} style={{ padding: 11, borderRadius: 10, backgroundColor: ZRA.surface, borderWidth: 1, borderColor: ZRA.border, gap: 8 }}>
                {(item.thumbnail || item.image) ? <Image source={{ uri: item.thumbnail || item.image }} resizeMode="cover" style={{ width: "100%", height: 170, borderRadius: 8, backgroundColor: ZRA.surfaceRaised }} /> : null}
                <Text style={{ color: ZRA.text, fontSize: 12, fontWeight: "800" }}>{item.title || "Hasil publik"}</Text>
                {item.summary ? <Text style={{ color: ZRA.muted, fontSize: 11, lineHeight: 16 }}>{item.summary}</Text> : null}
                {item.url ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url)}><Text numberOfLines={2} style={{ color: ZRA.mint, fontSize: 10, textDecorationLine: "underline" }}>{item.url}</Text></Pressable> : null}
                {(reportData.searchType === "maps_search" || reportData.searchType === "maps_image") && item.dataId ? <Pressable onPress={() => void handlePlacePhotos(item)} disabled={busy} style={{ paddingVertical: 9, paddingHorizontal: 11, alignSelf: "flex-start", borderRadius: 8, backgroundColor: ZRA.mintDim }}><Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>Lihat foto Google Maps</Text></Pressable> : null}
              </View>
            )) : <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic" }}>Tidak ada hasil untuk pencarian ini.</Text>}
            {reportData.searchType === "maps_photos" && reportData.nextPageToken ? <Pressable onPress={() => void handlePlacePhotos({ dataId: reportData.dataId, title: reportData.target }, reportData.nextPageToken)} disabled={busy} style={{ padding: 11, alignItems: "center", borderRadius: 9, backgroundColor: ZRA.mintDim }}><Text style={{ color: ZRA.mint, fontSize: 11, fontWeight: "800" }}>{busy ? "Memuat..." : "Muat foto berikutnya"}</Text></Pressable> : null}
            {reportData.limitations ? <Text style={{ color: ZRA.muted, fontSize: 10, lineHeight: 15 }}>{reportData.limitations}</Text> : null}
          </> : <Text style={{ color: ZRA.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 8 }}>Hasil dari Google Search, Google Lens, atau Google Maps akan tampil di sini.</Text>}
        </Panel>
        <SectionHeading label="Riwayat OSINT" />
        <AuditHistoryList items={osintHistory} emptyMessage="Belum ada riwayat OSINT." clearLabel="Hapus Riwayat OSINT" onClear={() => clearHistory("osint")} />
      </ScrollView>
    </ScreenShell>
  );
}
