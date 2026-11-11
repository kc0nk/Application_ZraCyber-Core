async function analyzeWeb(domain) {
  return { technology: ["Nginx", "Node.js", "React"], publicEndpoints: ["/", "/login", "/api"] };
}
module.exports = { analyzeWeb };
