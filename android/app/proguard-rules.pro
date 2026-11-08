# ============================================================================
# ZRACORE HARDENING & ANTI-JADX DECOMPILATION RULES
# ============================================================================

# Obfuscate all class, method, and field names
-repackageclasses 'a'
-allowaccessmodification
-renamesourcefileattribute ''
-keepattributes !SourceFile,!LineNumberTable,!LocalVariableTable,!LocalVariableTypeTable

# Anti-Debugging & Obfuscation
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses

# Preserve Native React Native & Expo Core Dependencies
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class expo.modules.** { *; }

# Prevent Reverse Engineering of Key Classes
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @expo.modules.core.interfaces.ExpoMethod *;
}
