const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function correlateApkWithAi(engineResult, apiKey) {
  if (!apiKey) return engineResult.findings;
  try {
    const prompt = `[ZRACORE APK SECURITY CORRELATOR - STRICT FACTUAL ANALYSIS]
Berikut adalah hasil static analysis dan security rule engine dari biner APK:
${JSON.stringify({ structure: engineResult.structure, findings: engineResult.findings }, null, 2)}

Sebagai Senior Mobile Security Auditor, hubungkan temuan-temuan di atas, jelaskan root cause, kelompokkan temuan, dan berikan analisis teknis dalam format JSON array of objects yang valid (tanpa markdown backticks), dengan properti: title, severity, cwe, evidence, location, check, summary. Bahasa Indonesia.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 3072,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]") + 1;
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(content.slice(start, end));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    // Fallback to rule engine findings if AI times out
  }
  return engineResult.findings;
}

module.exports = { correlateApkWithAi };
