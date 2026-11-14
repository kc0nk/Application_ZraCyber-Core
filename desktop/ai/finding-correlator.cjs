const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function correlateFindingsWithAi(urlGraph, ruleFindings, apiKey) {
  if (!apiKey || !Array.isArray(ruleFindings) || ruleFindings.length === 0) return ruleFindings;
  try {
    const prompt = `[ZRACORE WEBSITE PENTEST - FACTUAL AI CORRELATOR]
Berikut adalah daftar temuan berbasis bukti asli dari Security Rule Engine:
${JSON.stringify(ruleFindings, null, 2)}

Sebagai Senior Web Security Auditor, rangkum dan berikan penjelasan ringkas mengenai temuan berbasis bukti di atas.
ATURAN KETAT:
1. JANGAN menambah, mengurangi, atau mengubah daftar temuan di atas.
2. JANGAN mengubah tingkat severity (Critical/High/Medium/Low/Info) yang telah ditentukan oleh Rule Engine.
3. Kembalikan daftar temuan yang persis sama dengan menambahkan penjelasan ringkas pada atribut summary. Format JSON array. Bahasa Indonesia.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 3072,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]") + 1;
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(content.slice(start, end));
      if (Array.isArray(parsed) && parsed.length === ruleFindings.length) return parsed;
    }
  } catch {}
  return ruleFindings;
}

module.exports = { correlateFindingsWithAi };
