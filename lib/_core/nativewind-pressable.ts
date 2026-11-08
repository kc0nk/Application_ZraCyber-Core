// Tujuan file: Utilitas inti (nativewind pressable) untuk koneksi, autentikasi, tema, atau integrasi runtime.
// NativeWind + Pressable: className can swallow onPress. Disable className mapping globally.
import { Pressable } from "react-native";
import { remapProps } from "nativewind";

remapProps(Pressable, { className: false });
