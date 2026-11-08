const http = require("node:http");
const url = require("node:url");

const PORT = 8081;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Server", "Apache/2.4.41 (Ubuntu)");

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Reflected XSS Endpoint
  if (pathname === "/search") {
    const q = query.q || "";
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><body><h1>Hasil Pencarian untuk: ${q}</h1></body></html>`);
    return;
  }

  // SQL Injection Vulnerable Login Endpoint
  if (pathname === "/login.php") {
    const user = query.user || "";
    if (user.includes("' OR '1'='1")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "SQLi Bypass Success! Admin Session Granted." }));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "Invalid credentials" }));
    return;
  }

  // Exposed Sensitive Files
  if (pathname === "/.env" || pathname === "/config.json") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("DB_PASS=admin12345!\nSECRET_KEY=zracore_secret_key_2026\nDEBUG=true");
    return;
  }

  // Root Web Page
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <html>
      <head><title>Vulnerable Target Web App</title></head>
      <body>
        <h1>ZraCore Vulnerable Test Application</h1>
        <p>Aplikasi web uji coba untuk pengujian modul Website Pentest.</p>
        <ul>
          <li><a href="/search?q=<script>alert(1)</script>">Reflected XSS Test</a></li>
          <li><a href="/login.php?user=' OR '1'='1">SQL Injection Test</a></li>
          <li><a href="/.env">Exposed .env File</a></li>
        </ul>
      </body>
    </html>
  `);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ZRACORE WEBSITE LAB] Vulnerable web app running on http://127.0.0.1:${PORT}`);
});
