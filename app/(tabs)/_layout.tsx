// Tujuan file: File layar tab aplikasi; mengatur navigasi tab utama.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { useZraTheme } from "@/components/zra-ui";

export default function TabLayout() {
  const { ZRA } = useZraTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ZRA.button,
        tabBarInactiveTintColor: ZRA.muted,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 9, fontWeight: "700", marginBottom: 2 },
        tabBarItemStyle: { minWidth: 0, paddingHorizontal: 1 },
        tabBarStyle: {
          height: 65 + bottomPadding,
          paddingHorizontal: 4,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          backgroundColor: ZRA.surface,
          borderTopColor: ZRA.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Ringkasan", tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size ?? 20} color={color} /> }} />
      <Tabs.Screen name="security" options={{ title: "Security", tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size ?? 20} color={color} /> }} />
      <Tabs.Screen name="update" options={{ href: null }} />
      <Tabs.Screen name="tools" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ title: "Laporan", tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size ?? 20} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size ?? 20} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size ?? 20} color={color} /> }} />
    </Tabs>
  );
}
