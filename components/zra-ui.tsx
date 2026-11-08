// Tujuan file: Komponen antarmuka bersama (zra ui); dipakai ulang oleh beberapa layar aplikasi.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState, type ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useAppState } from "@/lib/app-state";
import { useThemeContext } from "@/lib/theme-provider";

const ZRA_PALETTES = {
  dark: {
    background: "#0B1016",
    surface: "#111923",
    surfaceRaised: "#172330",
    border: "#263544",
    text: "#F3F7FA",
    muted: "#8C9BA8",
    mint: "#38BDF8",
    mintDim: "#132738",
    amber: "#FFD28A",
    red: "#FF9C9C",
    blue: "#9BD3FF",
    onAccent: "#FFFFFF",
    button: "#1E40AF", // biru agak gelap
    buttonHover: "#2563EB",
    buttonText: "#FFFFFF",
    buttonSecondary: "#132338",
    buttonSecondaryText: "#93C5FD",
    buttonSecondaryBorder: "#274771",
  },
  light: {
    background: "#EDF2F7",
    surface: "#FFFFFF",
    surfaceRaised: "#F8FAFC",
    border: "#CBD5E1",
    text: "#0F172A",
    muted: "#64748B",
    mint: "#0F2744",
    mintDim: "#E2E8F0",
    amber: "#B45309",
    red: "#DC2626",
    blue: "#1E3A8A",
    onAccent: "#FFFFFF",
    button: "#0F2744", // biru dongker
    buttonHover: "#1E3A8A",
    buttonText: "#FFFFFF",
    buttonSecondary: "#E2E8F0",
    buttonSecondaryText: "#0F2744",
    buttonSecondaryBorder: "#94A3B8",
  },
} as const;
type ZraPalette = { [Key in keyof typeof ZRA_PALETTES.dark]: string };

export function ScreenShell({ children }: { children: ReactNode }) {
  const { styles } = useZraTheme();
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: width < 360 ? 14 : width < 380 ? 16 : 20, gap: width < 380 ? 17 : 21 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function ApiKeyNotice({ locationRequired = false }: { locationRequired?: boolean }) {
  const router = useRouter();
  const { ZRA, styles, colorScheme } = useZraTheme();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <StatusBar style={colorScheme === "light" ? "dark" : "light"} />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22 }}>
        <View style={{ gap: 14, padding: 22, borderWidth: 1, borderColor: `${ZRA.blue}77`, borderRadius: 20, backgroundColor: ZRA.surface }}>
          <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: `${ZRA.blue}22` }}>
            <Ionicons name="shield-outline" size={23} color={ZRA.blue} />
          </View>
          <Text style={{ color: ZRA.blue, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }}>
            AUTENTIKASI DIPERLUKAN
          </Text>
          <Text style={{ color: ZRA.text, fontSize: 21, lineHeight: 27, fontWeight: "800" }}>
            Device Belum Terdaftar
          </Text>
          <Text style={{ color: ZRA.muted, fontSize: 13, lineHeight: 19 }}>
            Menu ini memerlukan autentikasi desktop. Masuk ke menu Profil untuk menyimpan alamat Desktop dan memasukkan API key dari Dashboard Desktop.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={{ minHeight: 46, marginTop: 4, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: ZRA.button }}
          >
            <Text style={{ color: ZRA.buttonText, fontSize: 13, fontWeight: "800" }}>Buka Profil &amp; Hubungkan</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function BrandHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  const { styles } = useZraTheme();
  return (
    <View style={styles.header}>
      <View style={styles.brandLine}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 26, height: 26, borderRadius: 8 }}
        />
        <Text style={styles.brandName}>ZRACORE / 01</Text>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function SectionHeading({ label, action }: { label: string; action?: string }) {
  const { styles } = useZraTheme();
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function Panel({ children, accent = false, style }: { children: ReactNode; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  const { styles } = useZraTheme();
  return <View style={[styles.panel, accent && styles.panelAccent, style]}>{children}</View>;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "mint" | "amber" | "red" }) {
  const { ZRA, styles } = useZraTheme();
  const color = tone === "mint" ? ZRA.mint : tone === "amber" ? ZRA.amber : tone === "red" ? ZRA.red : ZRA.muted;
  return (
    <View style={[styles.pill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, icon = "arrow-forward", onPress, disabled = false }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primaryButton, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}>
      <Text style={[styles.primaryButtonText, disabled && styles.disabledButtonText]}>{label}</Text>
      <Ionicons name={icon} size={17} color={disabled ? ZRA.muted : ZRA.onAccent} />
    </Pressable>
  );
}

export function SecondaryButton({ label, icon = "add", onPress, disabled = false }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.secondaryButton, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}>
      <Ionicons name={icon} size={16} color={disabled ? ZRA.muted : ZRA.mint} />
      <Text style={[styles.secondaryButtonText, disabled && { color: ZRA.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceChip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, selected && styles.choiceChipSelected]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? ZRA.onAccent : ZRA.muted} /> : null}
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <TextInput
        {...props}
        placeholderTextColor={ZRA.muted}
        style={[styles.field, props.multiline && styles.fieldMultiline, props.style]}
      />
    </View>
  );
}

export function LockedPanel({ icon, title, message, detail = "Tambahkan Desktop API di Profil untuk membuka workspace." }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; detail?: string }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <Panel>
      <View style={styles.lockIcon}><Ionicons name={icon} size={22} color={ZRA.mint} /></View>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelBody}>{message}</Text>
      <View style={styles.lockDetail}><Ionicons name="lock-closed-outline" size={14} color={ZRA.muted} /><Text style={styles.lockDetailText}>{detail}</Text></View>
    </Panel>
  );
}

export function EmptyState({ icon, title, message }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string }) {
  const { ZRA, styles } = useZraTheme();
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={28} color={ZRA.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function createStyles(palette: ZraPalette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1, backgroundColor: palette.background },
  content: { paddingTop: 14, paddingBottom: 104 },
  header: { gap: 7, minWidth: 0 },
  brandLine: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
  brandName: { color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  logoMark: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, borderColor: palette.mint, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] },
  logoCut: { width: 9, height: 9, backgroundColor: palette.mint, borderRadius: 2 },
  eyebrow: { color: palette.mint, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: palette.text, fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.7, flexShrink: 1 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, maxWidth: 360, flexShrink: 1 },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  sectionLabel: { color: palette.text, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", flexShrink: 1 },
  sectionAction: { color: palette.muted, fontSize: 11, flexShrink: 1, textAlign: "right" },
  panel: { minWidth: 0, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 18, padding: 16, gap: 9 },
  panelAccent: { borderColor: `${palette.mint}60`, backgroundColor: palette.background === ZRA_PALETTES.dark.background ? "#101E1B" : "#E3F1E9" },
  panelTitle: { color: palette.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2, flexShrink: 1 },
  panelBody: { color: palette.muted, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  lockIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.mintDim, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  lockDetail: { flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12, marginTop: 4 },
  lockDetailText: { color: palette.muted, fontSize: 12, flex: 1 },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderRadius: 99, maxWidth: "100%" },
  pillDot: { width: 6, height: 6, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, flexShrink: 1 },
  primaryButton: { alignSelf: "stretch", minHeight: 48, paddingHorizontal: 13, borderRadius: 14, backgroundColor: palette.button, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryButtonText: { color: palette.buttonText, fontSize: 13, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  secondaryButton: { alignSelf: "stretch", minHeight: 46, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.buttonSecondaryBorder, backgroundColor: palette.buttonSecondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryButtonText: { color: palette.buttonSecondaryText, fontSize: 12, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  buttonDisabled: { backgroundColor: palette.background === ZRA_PALETTES.dark.background ? "#24313D" : "#D5DEE8", borderWidth: 1, borderColor: palette.border },
  disabledButtonText: { color: palette.muted },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  choiceChip: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.border, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.surface },
  choiceChipSelected: { borderColor: palette.button, backgroundColor: palette.button },
  choiceChipText: { color: palette.muted, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  choiceChipTextSelected: { color: palette.buttonText },
  fieldWrap: { gap: 7 },
  fieldLabelRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 4 },
  fieldLabel: { color: palette.text, fontSize: 12, fontWeight: "800" },
  fieldHint: { color: palette.muted, fontSize: 11 },
  field: { width: "100%", minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 13, paddingHorizontal: 13, color: palette.text, backgroundColor: palette.background, fontSize: 14, includeFontPadding: false },
  fieldMultiline: { minHeight: 88, paddingTop: 13, textAlignVertical: "top" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 58, paddingHorizontal: 24, gap: 9 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "800", marginTop: 5 },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: "center", flexShrink: 1 },
  });
}

export function useZraTheme() {
  const { colorScheme, setColorScheme } = useThemeContext();
  const ZRA = ZRA_PALETTES[colorScheme];
  const styles = useMemo(() => createStyles(ZRA), [colorScheme]);
  return { colorScheme, setColorScheme, ZRA, styles };
}
