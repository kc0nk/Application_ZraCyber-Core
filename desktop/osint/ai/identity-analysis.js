const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function analyzeIdentityWithAi(candidateData, apiKey) {
  const targetName = candidateData.target.rawQuery;
  if (!apiKey) return `**${targetName}** adalah subjek investigasi identitas yang memiliki indikasi jejak digital publik pada direktori terindeks.`;
  try {
    const prompt = `[ZRACORE OSINT FULL NARRATIVE INVESTIGATION]
Target Pencarian: "${targetName}"
Sebagai Senior OSINT Intelligence Analyst, buatlah laporan sintesis biografi dan investigasi intelijen yang mendalam mengenai "${targetName}".
Tuliskan narasi investigasi yang mengalir dan kaya informasi (seperti contoh: "${targetName} adalah seorang murid/atlet asal Jawa Timur yang tercatat pada tahun ... di wilayah ...").
Uraikan latar belakang pendidikan/sekolah, rekam jejak prestasi, afiliasi institusi, serta dokumen publik yang terhubung dalam format Markdown profesional minimal 3-4 paragraf. Jangan tampilkan daftar URL tautan web. Bahasa Indonesia.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 3072,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || `**${targetName}** adalah subjek yang memiliki rekam jejak identitas publik terindeks.`;
  } catch (err) {
    return `**${targetName}** adalah subjek yang memiliki rekam jejak identitas publik terindeks.`;
  }
}

module.exports = { analyzeIdentityWithAi };
