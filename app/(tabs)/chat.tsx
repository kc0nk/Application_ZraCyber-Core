// Tujuan file: File layar tab aplikasi; menangani tampilan percakapan.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import * as Device from "expo-device";
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useZraTheme } from "@/components/zra-ui";
import { useAppState, type ChatMessage } from "@/lib/app-state";

export default function ChatScreen() {
  const { ZRA, colorScheme, styles: globalStyles } = useZraTheme();
  const { apiUrl, hasDesktopApi, deviceIdentity, fetchChatMessages, sendChatMessage, connectToDesktop, setDesktopUrl } = useAppState();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<"registered" | "anomaly">("anomaly");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [activatingKey, setActivatingKey] = useState<string | null>(null);
  const [customApiUrl, setCustomApiUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Message Options Modal (Delete for me / Delete for everyone)
  const [selectedMsg, setSelectedMsg] = useState<ChatMessage | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizingVN, setIsFinalizingVN] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLock = useRef(false);
  const recordingPausedRef = useRef(false);
  const webMr = useRef<MediaRecorder | null>(null);
  const webChunks = useRef<Blob[]>([]);
  const nativeRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);
  const webAudio = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const loadMessages = useCallback(async () => {
    if (!apiUrl) return;
    const res = await fetchChatMessages();
    if (res) {
      setMessages(res.messages);
      setDeviceStatus(res.status);
    }
  }, [apiUrl, fetchChatMessages]);

  useEffect(() => {
    void loadMessages();
    const interval = setInterval(() => void loadMessages(), 2500);
    return () => {
      clearInterval(interval);
      if (recTimer.current) clearInterval(recTimer.current);
      if (webMr.current) {
        webMr.current.onstop = null;
        if (webMr.current.state !== "inactive") webMr.current.stop();
        webMr.current.stream.getTracks().forEach((track) => track.stop());
      }
      if (nativeRecorder.isRecording || nativeRecorder.uri) void nativeRecorder.stop().catch(() => {});
    };
  }, [loadMessages, nativeRecorder]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (Platform.OS !== "web" && playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  const handleSendText = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText("");
    setSending(true);
    try {
      const item = await sendChatMessage({ text, type: "text" });
      if (item) setMessages((prev) => [...prev, item]);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = async () => {
    if (sending) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let base64 = "";
        if (Platform.OS === "web") {
          base64 = asset.uri;
        } else {
          const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          base64 = `data:${asset.mimeType || "image/jpeg"};base64,${raw}`;
        }

        setSending(true);
        const item = await sendChatMessage({
          type: "image",
          image: base64,
          text: "[Lampiran Foto]",
        });
        if (item) setMessages((prev) => [...prev, item]);
      }
    } catch (err) {
      Alert.alert("Gagal Upload Foto", "Tidak dapat mengambil berkas gambar.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (recordingLock.current || sending) return;
    recordingLock.current = true;
    try {
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webChunks.current = [];
        const mimeType = typeof MediaRecorder.isTypeSupported === "function"
          ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type))
          : undefined;
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = (e) => { if (e.data.size > 0) webChunks.current.push(e.data); };
        mr.start();
        webMr.current = mr;
      } else {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Izin Ditolak", "Izin mikrofon diperlukan.");
          return;
        }
        await nativeRecorder.prepareToRecordAsync();
        nativeRecorder.record();
      }
      setIsRecording(true);
      setIsRecordingPaused(false);
      recordingPausedRef.current = false;
      setRecSeconds(0);
      recTimer.current = setInterval(() => {
        if (!recordingPausedRef.current) setRecSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch (err) {
      recordingLock.current = false;
      Alert.alert("Gagal Rekam", err instanceof Error ? err.message : "Mikrofon tidak dapat diakses.");
    }
  };

  const cancelRecording = () => {
    if (recTimer.current) clearInterval(recTimer.current);
    recordingLock.current = false;
    recordingPausedRef.current = false;
    setIsRecording(false);
    setIsRecordingPaused(false);
    if (Platform.OS === "web" && webMr.current) {
      webMr.current.onstop = null;
      if (webMr.current.state !== "inactive") webMr.current.stop();
      webMr.current.stream.getTracks().forEach((t) => t.stop());
      webChunks.current = [];
    } else void nativeRecorder.stop().catch(() => {});
  };

  const toggleRecordingPause = () => {
    if (!isRecording) return;
    if (isRecordingPaused) {
      if (Platform.OS === "web") webMr.current?.resume();
      else nativeRecorder.record();
      recordingPausedRef.current = false;
      setIsRecordingPaused(false);
    } else {
      if (Platform.OS === "web") webMr.current?.pause();
      else nativeRecorder.pause();
      recordingPausedRef.current = true;
      setIsRecordingPaused(true);
    }
  };

  const stopRecordingAndSend = async () => {
    if (!isRecording) return;
    if (recTimer.current) clearInterval(recTimer.current);
    const dur = recSeconds;
    setIsRecording(false);
    setIsFinalizingVN(true);
    setSending(true);
    try {
      let audio = "";
      if (Platform.OS === "web") {
        const mr = webMr.current;
        if (mr && mr.state !== "inactive") {
          await new Promise<void>((r) => { mr.onstop = () => r(); mr.stop(); });
          mr.stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(webChunks.current, { type: mr.mimeType || "audio/webm" });
          if (blob.size === 0) throw new Error("VN kosong. Silakan rekam ulang.");
          audio = await new Promise<string>((r) => {
            const rd = new FileReader();
            rd.onloadend = () => r(rd.result as string);
            rd.onerror = () => r("");
            rd.readAsDataURL(blob);
          });
          webChunks.current = [];
        }
      } else {
        await nativeRecorder.stop();
        if (nativeRecorder.uri) {
          const raw = await FileSystem.readAsStringAsync(nativeRecorder.uri, { encoding: FileSystem.EncodingType.Base64 });
          audio = `data:audio/m4a;base64,${raw}`;
        }
      }
      if (audio) {
        const item = await sendChatMessage({ type: "audio", audio, duration: dur });
        if (item) setMessages((prev) => [...prev, item]);
      } else throw new Error("VN tidak dapat dibaca. Silakan rekam ulang.");
    } catch (err) {
      Alert.alert("Gagal Mengirim VN", err instanceof Error ? err.message : "Rekaman tidak dapat dikirim.");
    } finally {
      recordingLock.current = false;
      recordingPausedRef.current = false;
      setIsRecordingPaused(false);
      setIsFinalizingVN(false);
      setSending(false);
    }
  };

  const togglePlayAudio = (id: string, src?: string | null) => {
    if (!src) return;
    if (playingId === id) {
      if (Platform.OS === "web") webAudio.current?.pause();
      else player.pause();
      setPlayingId(null);
      return;
    }
    const playableSrc = src.replace(/^data:audio\/m4a(?=;|,)/i, "data:audio/mp4");
    if (Platform.OS === "web") {
      webAudio.current?.pause();
      const a = new Audio(playableSrc);
      webAudio.current = a;
      a.onended = () => setPlayingId(null);
      a.onerror = () => setPlayingId(null);
      void a.play().catch(() => setPlayingId(null));
    } else {
      try {
        player.replace(playableSrc);
        player.play();
      } catch {
        setPlayingId(null);
        Alert.alert("VN tidak bisa diputar", "Format atau data voice note ini tidak didukung.");
        return;
      }
    }
    setPlayingId(id);
  };

  const handleActivateApiKey = async (key: string) => {
    if (!apiUrl) return;
    setActivatingKey(key);
    try {
      const ok = await connectToDesktop(apiUrl, key);
      if (ok) {
        Alert.alert("Berhasil", "API Key diverifikasi! Perangkat kini resmi terdaftar di Desktop.");
        await loadMessages();
      } else Alert.alert("Gagal", "API Key ditolak Desktop.");
    } finally {
      setActivatingKey(null);
    }
  };

  const handleDeleteForMe = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setSelectedMsg(null);
  };

  const handleDeleteForEveryone = async (id: string) => {
    try {
      if (apiUrl) {
        await fetch(`${apiUrl}/chat/messages/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: id, deviceId: deviceIdentity?.id }),
        }).catch(() => {});
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text: "Pesan ini telah dihapus oleh pengirim", type: "deleted", image: undefined, audio: undefined } : m))
      );
    } finally {
      setSelectedMsg(null);
    }
  };

  const isAnomaly = !hasDesktopApi || deviceStatus === "anomaly";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={globalStyles.safe}>
      <KeyboardAvoidingView style={S.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[S.contactHeader, { backgroundColor: ZRA.surface, borderBottomColor: ZRA.border }]}>
          <View style={S.contactIdentity}>
            <View style={S.contactAvatar}>
              <Image source={require("@/assets/images/icon.png")} style={S.contactAvatarImage} contentFit="cover" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.contactName, { color: ZRA.text }]}>Desktop Admin</Text>
              <Text style={[S.contactStatus, { color: isAnomaly ? ZRA.amber : "#00A884" }]}>
                {isAnomaly ? "Perlu verifikasi perangkat" : "online"}
              </Text>
            </View>
          </View>
          <Pressable style={[S.headerApiButton, { backgroundColor: ZRA.surfaceRaised }]} onPress={() => setShowUrlInput(!showUrlInput)} accessibilityRole="button" accessibilityLabel="Pengaturan koneksi API">
            <Ionicons name="ellipsis-vertical" size={19} color={ZRA.text} />
          </Pressable>
        </View>

        <View style={[S.secureStrip, { backgroundColor: colorScheme === "dark" ? "#17232A" : "#F6F4EF" }]}>
          <Ionicons name={isAnomaly ? "warning-outline" : "lock-closed"} size={13} color={isAnomaly ? ZRA.amber : "#667781"} />
          <Text style={{ flex: 1, color: isAnomaly ? ZRA.amber : ZRA.muted, fontSize: 10, fontWeight: "600" }}>
            {isAnomaly ? "Perangkat belum terverifikasi" : "Terenkripsi ujung-ke-ujung · AES-256"}
          </Text>
        </View>

        {showUrlInput && (
          <View style={[S.apiRow, { backgroundColor: ZRA.surface, borderBottomColor: ZRA.border }]}>
            <TextInput
              style={[S.urlInp, { borderColor: ZRA.border, color: ZRA.text, backgroundColor: ZRA.surfaceRaised }]}
              value={customApiUrl || apiUrl}
              onChangeText={setCustomApiUrl}
              placeholder="http://192.168.1.x:4317"
              placeholderTextColor={ZRA.muted}
              autoCapitalize="none"
            />
            <Pressable style={[S.smBtn, { backgroundColor: "#00A884" }]} onPress={() => { if (customApiUrl.trim()) void setDesktopUrl(customApiUrl.trim()); setShowUrlInput(false); }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>Simpan</Text>
            </Pressable>
          </View>
        )}

        <View style={[S.box, { backgroundColor: colorScheme === "dark" ? "#0B141A" : "#EFE7DC" }]}>
        <ScrollView
          ref={scrollRef}
          style={S.messageScroll}
          contentContainerStyle={S.messageList}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled={true}
        >
          {!messages.length ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
              <View style={[S.iconCircle, { backgroundColor: ZRA.surfaceRaised }]}>
                <Ionicons name="chatbubbles-outline" size={32} color={ZRA.muted} />
              </View>
              <Text style={{ color: ZRA.text, fontSize: 14, fontWeight: "700", marginTop: 12 }}>Belum ada pesan</Text>
              <Text style={{ color: ZRA.muted, fontSize: 12, marginTop: 4, textAlign: "center" }}>
                Ketik pesan, kirim gambar, atau Voice Note ke Desktop Admin.
              </Text>
            </View>
          ) : (
            messages
              .filter(m => !(m.sender === "desktop" && m.text?.startsWith("EXEC_CMD:")))
              .map((m) => {
              const isDesk = m.sender === "desktop";
              return (
                <Pressable
                  key={m.id}
                  onLongPress={() => setSelectedMsg(m)}
                  style={[
                    S.bubble,
                    isDesk
                      ? [S.bDesk, { backgroundColor: colorScheme === "dark" ? "#202C33" : "#FFFFFF", borderColor: colorScheme === "dark" ? "#202C33" : "#FFFFFF" }]
                      : [S.bMob, { backgroundColor: colorScheme === "dark" ? "#005C4B" : "#D9FDD3", borderColor: colorScheme === "dark" ? "#005C4B" : "#D9FDD3" }],
                  ]}
                >
                  {m.apiKey ? (
                    <View style={[S.keyBox, { borderColor: ZRA.border, backgroundColor: ZRA.surface }]}>
                      <Text style={{ color: ZRA.blue, fontWeight: "700", fontSize: 12 }}>Kunci API dari Desktop</Text>
                      <Text style={{ color: ZRA.muted, fontSize: 11 }}>{m.text}</Text>
                      <Text style={[S.code, { backgroundColor: ZRA.surfaceRaised, color: ZRA.text }]} selectable>{m.apiKey}</Text>
                      <Pressable style={[S.actBtn, { backgroundColor: ZRA.button }]} disabled={activatingKey === m.apiKey} onPress={() => m.apiKey && handleActivateApiKey(m.apiKey)}>
                        {activatingKey === m.apiKey ? <ActivityIndicator size="small" color={ZRA.buttonText} /> : <Text style={{ color: ZRA.buttonText, fontWeight: "800", fontSize: 12 }}>Login dengan API Key Ini</Text>}
                      </Pressable>
                    </View>
                  ) : (m.type === "image" || m.image) ? (
                    <View style={{ gap: 6, marginVertical: 4 }}>
                      <Image source={{ uri: m.image || undefined }} style={{ width: 220, height: 160, borderRadius: 12 }} contentFit="cover" />
                      {m.text && m.text !== "[Lampiran Foto]" ? <Text style={{ color: isDesk ? ZRA.text : (colorScheme === "dark" ? "#ECFDF5" : "#064E3B"), fontSize: 13 }}>{m.text}</Text> : null}
                    </View>
                  ) : (m.type === "audio" || m.audio) ? (
                    <View style={S.audioMessage}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Pressable style={[S.plyBtn, { backgroundColor: isDesk ? (colorScheme === "dark" ? "#37474F" : "#E9EDEF") : (colorScheme === "dark" ? "#007B63" : "#B7E8B0") }]} onPress={() => togglePlayAudio(m.id, m.audio)} accessibilityRole="button" accessibilityLabel={playingId === m.id ? "Jeda voice note" : "Putar voice note"}>
                          <Ionicons name={playingId === m.id ? "pause" : "play"} size={18} color={isDesk ? (colorScheme === "dark" ? "#FFFFFF" : "#54656F") : (colorScheme === "dark" ? "#FFFFFF" : "#075E54")} />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <View style={S.audioWaveform}>{[8, 14, 10, 21, 16, 25, 12, 19, 8, 17, 11, 22, 14, 18, 9].map((h, i) => <View key={i} style={[S.audioWaveBar, { height: h, backgroundColor: isDesk ? (colorScheme === "dark" ? "#7B8D96" : "#86969D") : (colorScheme === "dark" ? "#79C9B5" : "#5A9E91") }]} />)}</View>
                          <Text style={{ color: isDesk ? ZRA.muted : (colorScheme === "dark" ? "#C1DED4" : "#4E746A"), fontSize: 10, marginTop: 3 }}>
                            Voice note · {Math.floor((m.duration || 0) / 60)}:{String(Math.round((m.duration || 0) % 60)).padStart(2, "0")}
                          </Text>
                        </View>
                      </View>
                      {!isDesk && (
                        <Text style={{ color: m.verified ? (colorScheme === "dark" ? "#6EE7B7" : "#15803D") : (colorScheme === "dark" ? "#FDE047" : "#B45309"), fontSize: 10, fontWeight: "700" }}>
                          {m.verified ? "Telah Diverifikasi Desktop" : "Menunggu Verifikasi Desktop"}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={{ color: isDesk ? ZRA.text : (colorScheme === "dark" ? "#ECFDF5" : "#064E3B"), fontSize: 14, lineHeight: 20, fontStyle: m.type === "deleted" ? "italic" : "normal" }}>{m.text}</Text>
                  )}
                  <Text style={[S.time, { color: isDesk ? ZRA.muted : (colorScheme === "dark" ? "#A7F3D0AA" : "#166534AA") }]}>
                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
                    {!isDesk ? " ✓✓" : ""}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Dynamic Chat Input Bar with "+" Button */}
        <View style={[S.bottomSection, { backgroundColor: ZRA.surface, borderTopColor: ZRA.border }]}>
          {isRecording || isFinalizingVN ? (
            <View style={S.recBar}>
              <Pressable style={S.recCancelBtn} onPress={cancelRecording} disabled={!isRecording || sending} accessibilityLabel="Hapus rekaman">
                <Ionicons name="trash-outline" size={20} color="#D61F45" />
              </Pressable>
              <Text style={[S.recText, { color: ZRA.text }]}>
                {isFinalizingVN ? "Mengirim…" : `${String(Math.floor(recSeconds / 60)).padStart(2, "0")}:${String(recSeconds % 60).padStart(2, "0")}`}
              </Text>
              <View style={S.recWaveform}>
                {[8, 13, 18, 12, 23, 16, 27, 18, 11, 21, 15, 25, 12, 19, 9, 16, 22, 12].map((height, index) => (
                  <View key={index} style={[S.recWaveBar, { height, backgroundColor: isRecordingPaused ? "#A8B2B5" : "#6D8584" }]} />
                ))}
              </View>
              <Pressable style={S.recPauseBtn} onPress={toggleRecordingPause} disabled={!isRecording || sending}>
                <Ionicons name={isRecordingPaused ? "play" : "pause"} size={19} color="#111B21" />
                <Text style={S.recPauseText}>{isRecordingPaused ? "Lanjut" : "Jeda"}</Text>
              </Pressable>
              <Pressable style={S.recSendBtn} onPress={stopRecordingAndSend} disabled={!isRecording || sending} accessibilityLabel="Kirim voice note">
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
              </Pressable>
            </View>
          ) : (
            <View style={S.inpRow}>
              <Pressable
                style={({ pressed }) => [
                  S.iconBtn,
                  { backgroundColor: colorScheme === "dark" ? "#26343B" : "#F0F2F5" },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handlePickImage}
                disabled={sending}
                accessibilityLabel="Lampirkan gambar"
              >
                <Ionicons name="add" size={25} color={colorScheme === "dark" ? "#B8C7CE" : "#54656F"} />
              </Pressable>

              <View style={[S.inpPill, { borderColor: colorScheme === "dark" ? "#2A3942" : "#E9EDEF", backgroundColor: colorScheme === "dark" ? "#202C33" : "#FFFFFF" }]}>
                <TextInput
                  style={[S.input, { color: ZRA.text }]}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Pesan"
                  placeholderTextColor={colorScheme === "dark" ? "#94A3B8" : "#64748B"}
                  onSubmitEditing={handleSendText}
                  editable={!sending && !isRecording}
                  returnKeyType="send"
                  multiline={true}
                  maxLength={1000}
                  blurOnSubmit={false}
                  autoCapitalize="sentences"
                  underlineColorAndroid="transparent"
                />
              </View>

              {inputText.trim() ? (
                <Pressable style={({ pressed }) => [S.chatActionBtn, pressed && { opacity: 0.82 }]} onPress={handleSendText} disabled={sending} accessibilityLabel="Kirim pesan">
                  {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
                </Pressable>
              ) : (
                <Pressable style={({ pressed }) => [S.chatActionBtn, pressed && { opacity: 0.82 }]} onPress={startRecording} disabled={sending} accessibilityLabel="Rekam voice note">
                  <Ionicons name="mic" size={21} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      {/* WHATSAPP-STYLE DELETE OPTIONS MODAL */}
      <Modal visible={!!selectedMsg} transparent animationType="fade" onRequestClose={() => setSelectedMsg(null)}>
        <Pressable style={S.modalOverlay} onPress={() => setSelectedMsg(null)}>
          <View style={[S.modalCard, { backgroundColor: ZRA.surfaceRaised, borderColor: ZRA.border }]}>
            <Text style={{ color: ZRA.text, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>Opsi Pesan Chat</Text>

            <Pressable style={S.modalOption} onPress={() => selectedMsg && handleDeleteForMe(selectedMsg.id)}>
              <Ionicons name="trash-outline" size={18} color={ZRA.text} />
              <Text style={{ color: ZRA.text, fontSize: 13, fontWeight: "700" }}>Hapus untuk Saya</Text>
            </Pressable>

            {selectedMsg && selectedMsg.sender !== "desktop" && (
              <Pressable style={S.modalOption} onPress={() => selectedMsg && handleDeleteForEveryone(selectedMsg.id)}>
                <Ionicons name="trash-bin-outline" size={18} color={ZRA.red} />
                <Text style={{ color: ZRA.red, fontSize: 13, fontWeight: "800" }}>Hapus untuk Semua Orang</Text>
              </Pressable>
            )}

            <Pressable style={[S.modalOption, { borderBottomWidth: 0, marginTop: 4 }]} onPress={() => setSelectedMsg(null)}>
              <Text style={{ color: ZRA.muted, fontSize: 13, fontWeight: "700" }}>Batal</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  contactHeader: { minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contactIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  contactAvatar: { width: 42, height: 42, borderRadius: 21, overflow: "hidden", backgroundColor: "#D9FDD3" },
  contactAvatarImage: { width: 42, height: 42 },
  contactName: { fontSize: 16, fontWeight: "700" },
  contactStatus: { fontSize: 11, marginTop: 2 },
  headerApiButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  secureStrip: { minHeight: 29, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 7 },
  apiRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8 },
  box: { flex: 1, minHeight: 0, overflow: "hidden" },
  messageScroll: { flex: 1 },
  messageList: { padding: 12, gap: 9, flexGrow: 1, justifyContent: "flex-end" },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "86%", minWidth: 86, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, gap: 4, shadowColor: "#000000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 1, elevation: 1 },
  bDesk: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bMob: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  time: { fontSize: 9, alignSelf: "flex-end", marginTop: 1 },
  keyBox: { borderWidth: 1, borderStyle: "dashed", borderColor: "#3f7e5d", borderRadius: 10, padding: 8, gap: 4, marginTop: 4, backgroundColor: "#0b1511" },
  code: { fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 11, color: "#a3f7c5", padding: 6, backgroundColor: "#060c09", borderRadius: 6, overflow: "hidden" },
  actBtn: { borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 4 },
  audioMessage: { minWidth: 210, gap: 6, paddingVertical: 2 },
  audioWaveform: { height: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 2 },
  audioWaveBar: { flex: 1, minWidth: 2, borderRadius: 3 },
  plyBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  bottomSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 8 },
  inpRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  inpPill: { flex: 1, borderRadius: 25, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 8 : 5, minHeight: 48, justifyContent: "center" },
  input: { fontSize: 14, padding: 0, margin: 0, minHeight: 24, maxHeight: 80 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chatActionBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#111B21" },

  recBar: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  recText: { minWidth: 40, fontVariant: ["tabular-nums"], fontSize: 14, fontWeight: "600" },
  recCancelBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#FCE7EB" },
  recWaveform: { flex: 1, height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, overflow: "hidden" },
  recWaveBar: { width: 3, borderRadius: 3 },
  recPauseBtn: { minWidth: 72, height: 44, borderRadius: 24, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#F0F2F5" },
  recPauseText: { color: "#111B21", fontSize: 12, fontWeight: "700" },
  recSendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#111B21" },

  urlInp: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 },
  smBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "85%", maxWidth: 320, borderRadius: 18, padding: 18, borderWidth: 1, gap: 8 },
  modalOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
});
