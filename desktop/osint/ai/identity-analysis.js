const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function analyzeIdentityWithAi(candidateData, apiKey) {
  const targetName = candidateData.target.rawQuery;
  const verifiedProfiles = (candidateData.profiles || []).filter(p => p.status === "found" || p.status === "verified");

  if (verifiedProfiles.length === 0) {
    return `### ASESMEN IDENTITAS FAKTUAL: ${targetName}\n\n- **Status Verifikasi**: Belum ditemukan bukti profil publik terverifikasi yang cukup untuk mengonfirmasi identitas ini secara otomatis.\n- **Saran Investigasi**: Lakukan verifikasi manual melalui indeks pencarian publik untuk memastikan kecocokan metadata secara spesifik.\n\n*Catatan Integritas*: Platform tidak menyajikan biografi spekulatif tanpa adanya bukti profil terverifikasi.`;
  }

  if (!apiKey) {
    return `### ASESMEN IDENTITAS FAKTUAL: ${targetName}\n\n- **Profil Terverifikasi**: Ditemukan ${verifiedProfiles.length} profil publik terverifikasi.\n- **Sumber**: ${verifiedProfiles.map(p => p.platform).join(", ")}`;
  }

  try {
    const prompt = `[ZRACORE OSINT FACTUAL IDENTITY ASSESSMENT]
Target Pencarian: "${targetName}"
Profil Terverifikasi Ditemukan:
${JSON.stringify(verifiedProfiles, null, 2)}

Sebagai Senior OSINT Intelligence Analyst, berikan laporan asesmen identitas yang strictly faktual berdasarkan data profil terverifikasi di atas.
ATURAN KETAT:
1. Hanya rangkum bukti yang benar-benar ada di dalam profil terverifikasi di atas.
2. JANGAN mengarang cerita, biografi spekulatif, atau asumsikan dua profil milik orang yang sama hanya karena namanya cocok tanpa bukti unik.
3. Rangkum bukti publik dan sertakan platform/sumbernya secara jujur. Bahasa Indonesia, format Markdown.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || `### ASESMEN IDENTITAS FAKTUAL: ${targetName}\n\n- **Profil Terverifikasi**: Ditemukan ${verifiedProfiles.length} profil publik.`;
  } catch (err) {
    return `### ASESMEN IDENTITAS FAKTUAL: ${targetName}\n\n- **Profil Terverifikasi**: Ditemukan ${verifiedProfiles.length} profil publik.`;
  }
}

module.exports = { analyzeIdentityWithAi };
