// Tujuan file: Hook React (use color scheme) untuk membungkus state atau perilaku yang dapat dipakai ulang.
import { useThemeContext } from "@/lib/theme-provider";

export function useColorScheme() {
  return useThemeContext().colorScheme;
}
