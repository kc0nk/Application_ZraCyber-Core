// Tujuan file: Komponen antarmuka bersama (markdown renderer); dipakai ulang oleh beberapa layar aplikasi.
import React from "react";
import { Text, View, Platform } from "react-native";

interface MarkdownRendererProps {
  content: string;
  textColor?: string;
  codeColor?: string;
  fontSize?: number;
}

export function MarkdownRenderer({ content, textColor = "#0f172a", codeColor = "#34d399", fontSize = 12 }: MarkdownRendererProps) {
  if (typeof content !== "string" || !content) return null;

  const lines = content.split("\n");

  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
          return null;
        }

        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          const cells = trimmed.split("|").filter(Boolean).map(c => c.trim());
          return (
            <View key={idx} style={{ flexDirection: "row", backgroundColor: "rgba(0,0,0,0.03)", padding: 6, borderRadius: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }}>
              {cells.map((cell, cIdx) => (
                <Text key={cIdx} style={{ flex: 1, color: textColor, fontSize: fontSize - 1, fontWeight: "600", textAlign: "center" }}>
                  {cell}
                </Text>
              ))}
            </View>
          );
        }

        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const bulletText = trimmed.slice(2);
          return (
            <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", paddingLeft: 8, gap: 6 }}>
              <Text style={{ color: codeColor, fontWeight: "900", fontSize }}>•</Text>
              <Text style={{ color: textColor, fontSize, flex: 1, lineHeight: fontSize * 1.5 }}>
                {bulletText}
              </Text>
            </View>
          );
        }

        return (
          <Text key={idx} style={{ color: textColor, fontSize, lineHeight: fontSize * 1.5 }}>
            {trimmed}
          </Text>
        );
      })}
    </View>
  );
}
