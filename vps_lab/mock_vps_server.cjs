const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 8080;
const targetJson = path.join(__dirname, "simulated_target.json");

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/target" && req.method === "GET") {
    const data = fs.readFileSync(targetJson, "utf8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(data);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found in VPS lab" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ZRACORE VPS LAB] Mock VPS target server running on http://127.0.0.1:${PORT}`);
});
