const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = 8091;

const demoPage = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Google Secure Account Login · Simulasi Lab</title>
  <meta name="description" content="Halaman latihan phishing inert untuk pengujian indikator lokal.">
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #eef2f7; color: #172033; font: 16px system-ui, sans-serif; }
    main { width: min(420px, calc(100% - 40px)); padding: 28px; border: 1px solid #cbd5e1; border-radius: 18px; background: white; box-shadow: 0 18px 50px #1720331a; }
    .training { padding: 10px; border-radius: 8px; background: #fff7ed; color: #9a3412; font-weight: 800; }
    label { display: block; margin: 16px 0 6px; font-weight: 700; }
    input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #94a3b8; border-radius: 8px; }
    button { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 8px; background: #1d4ed8; color: white; font-weight: 800; }
    #notice { margin-top: 14px; color: #166534; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <p class="training">SIMULASI LAB LOKAL · JANGAN GUNAKAN KREDENSIAL ASLI</p>
    <h1>Google Account Verification</h1>
    <p>Contoh halaman tiruan untuk menguji indikator URL dan form password.</p>
    <form action="https://capture.example.invalid/collect" method="post" onsubmit="event.preventDefault(); document.getElementById('notice').hidden = false; return false;">
      <label for="demo-user">Email</label>
      <input id="demo-user" name="email" type="email" autocomplete="off" placeholder="contoh@example.invalid">
      <label for="demo-password">Password</label>
      <input id="demo-password" name="password" type="password" autocomplete="new-password" placeholder="Hanya contoh, jangan isi data asli">
      <button type="submit">Simulasikan · tidak mengirim data</button>
    </form>
    <p id="notice" hidden>Simulasi selesai. Tidak ada data yang dikirim atau disimpan.</p>
  </main>
</body>
</html>`;

const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET" && request.url === "/login-demo") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action https://capture.example.invalid; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(demoPage);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Phishing lab route not found.");
});

server.listen(PORT, HOST, () => {
  console.log(`[ZRACORE PHISHING LAB] Local-only demo running at http://${HOST}:${PORT}/login-demo`);
  console.log("[ZRACORE PHISHING LAB] Demo form never stores or sends submitted data.");
});
