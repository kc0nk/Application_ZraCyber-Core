async function analyzeHttp(domain) {
  return { headers: { "server": "nginx", "x-frame-options": "SAMEORIGIN" }, methods: ["GET", "POST"] };
}
module.exports = { analyzeHttp };
