const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function callGroqAi(prompt, apiKey) {
  if (!apiKey) return "[]";
  try {
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
    return data.choices?.[0]?.message?.content || "[]";
  } catch {
    return "[]";
  }
}

module.exports = { callGroqAi };
