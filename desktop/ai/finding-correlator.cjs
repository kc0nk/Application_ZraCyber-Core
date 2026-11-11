const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function correlateFindingsWithAi(urlGraph, ruleFindings, apiKey) {
  if (!apiKey) return ruleFindings;
  try {
    const prompt = `[ZRACORE WEBSITE PENTEST - AI CORRELATOR]
URL Graph & Rule Findings:
${JSON.stringify({ urlGraph, ruleFindings }, null, 2)}

Sebagai Senior Web Security Auditor, hubungkan temuan-temuan di atas, jelaskan root cause, dan prioritaskan remediation dalam format JSON array of objects yang valid (tanpa markdown backticks), dengan properti: title, severity, cwe, evidence, location, check, summary. Bahasa Indonesia.`;

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
  } catch {}
  return ruleFindings;
}

module.exports = { correlateFindingsWithAi };
