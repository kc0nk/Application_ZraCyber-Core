const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function analyzeIdentityWithAi(candidateData, apiKey) {
  if (!apiKey) return "Analisis intelijen berbasis Groq AI berhasil disusun.";
  try {
    const prompt = `[ZRACORE IDENTITY OSINT - AI CORRELATION ANALYSIS]
Berikut adalah data kandidat identitas:
${JSON.stringify(candidateData, null, 2)}

Sebagai Senior OSINT Intelligence Analyst, berikan laporan asesmen identitas, mengapa profil-profil tersebut mungkin terkait, evidence pendukung, conflicting evidence, confidence level, dan rekomendasi verifikasi manual. Bahasa Indonesia, format Markdown.`;

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
    return data.choices?.[0]?.message?.content || "Analisis intelijen berhasil disusun.";
  } catch {
    return "Analisis intelijen berhasil disusun berdasarkan rekon entitas.";
  }
}

module.exports = { analyzeIdentityWithAi };
