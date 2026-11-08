// Tujuan file: File lab website lokal (server) untuk menjalankan atau menata aplikasi latihan.
const { createServer } = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const PRODUCTION = process.env.NODE_ENV === "production";
const USERNAME = process.env.LAB_USERNAME || (PRODUCTION ? "" : "labuser");
const PASSWORD = process.env.LAB_PASSWORD || (PRODUCTION ? "" : "lab-only-change-me");
if (PRODUCTION && (!USERNAME || PASSWORD.length < 16)) {
  throw new Error("Set LAB_USERNAME and a unique LAB_PASSWORD of at least 16 characters before production startup.");
}

const sessions = new Map();
const csrfTokens = new Map();
const loginAttempts = new Map();
const MAX_BODY_BYTES = 4096;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function securityHeaders(response, contentType = "text/html; charset=utf-8") {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("X-Frame-Options", "DENY");
  if (PRODUCTION) response.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function send(response, status, html) {
  securityHeaders(response);
  response.writeHead(status);
  response.end(html);
}

function page(title, content) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · ZraCore Lab</title><link rel="stylesheet" href="/styles.css"></head>
<body><header><a href="/">ZRACORE / WEBSITE LAB</a></header><main><section class="card">${content}</section></main><footer>Demo latihan lokal. Gunakan hanya dengan izin yang sesuai.</footer></body></html>`;
}

function cookieValue(request, name) {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function isAuthenticated(request) {
  const session = cookieValue(request, "lab_session");
  const expiresAt = sessions.get(session) || 0;
  if (expiresAt <= Date.now()) {
    sessions.delete(session);
    return false;
  }
  return true;
}

function setSessionCookie(response, session) {
  const parts = [`lab_session=${session}`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=1800"];
  if (PRODUCTION) parts.push("Secure");
  response.setHeader("Set-Cookie", parts.join("; "));
}

function issueCsrfToken() {
  const token = randomBytes(24).toString("hex");
  csrfTokens.set(token, Date.now() + 10 * 60_000);
  if (csrfTokens.size > 1000) {
    const now = Date.now();
    for (const [key, expiry] of csrfTokens) if (expiry <= now) csrfTokens.delete(key);
    while (csrfTokens.size > 1000) csrfTokens.delete(csrfTokens.keys().next().value);
  }
  return token;
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Form terlalu besar."), { statusCode: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function rateLimited(request) {
  const address = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (loginAttempts.get(address) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 8) return true;
  recent.push(now);
  loginAttempts.set(address, recent);
  if (loginAttempts.size > 2000) loginAttempts.delete(loginAttempts.keys().next().value);
  return false;
}

function loginPage(message = "") {
  const csrf = issueCsrfToken();
  return page("Login lab", `<p class="eyebrow">Akun latihan</p><h1>Masuk ke lab</h1><p>Login ini hanya membuka halaman demo tanpa data pengguna sungguhan.</p>${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}<form action="/login" method="post"><input type="hidden" name="csrf_token" value="${csrf}"><label>Username<input name="username" type="text" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Masuk</button></form>`);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/styles.css") {
      const css = await readFile(path.join(__dirname, "styles.css"));
      securityHeaders(response, "text/css; charset=utf-8");
      response.writeHead(200);
      response.end(css);
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      send(response, 200, page("Beranda", `<p class="eyebrow">Demo crawler & autentikasi</p><h1>Website Lab</h1><p>Aplikasi latihan untuk mencoba pemetaan halaman publik, login satu kali, halaman dalam sesi, dan form pencarian GET.</p><div class="links"><a href="/login">Login demo</a><a class="secondary" href="/about">Tentang lab</a></div><form action="/search" method="get"><label>Cari halaman contoh<input name="q" type="search" placeholder="Ketik kata pencarian"></label><button type="submit">Cari</button></form><p class="notice">Tidak ada input yang dieksekusi dan halaman ini tidak menyimpan data.</p>`));
      return;
    }

    if (request.method === "GET" && pathname === "/about") {
      send(response, 200, page("Tentang", `<p class="eyebrow">Halaman publik</p><h1>Tentang lab</h1><p>Lab ini menyediakan halaman demo agar crawler dapat membangun peta endpoint.</p><div class="links"><a href="/">Beranda</a><a class="secondary" href="/login">Login demo</a></div>`));
      return;
    }

    if (request.method === "GET" && pathname === "/search") {
      send(response, 200, page("Pencarian", `<p class="eyebrow">Form GET aman</p><h1>Pencarian demo</h1><p>Pencarian selesai. Halaman latihan tidak menampilkan kembali nilai input.</p><div class="links"><a href="/">Kembali</a></div>`));
      return;
    }

    if (request.method === "GET" && pathname === "/login") {
      send(response, 200, loginPage());
      return;
    }

    if (request.method === "POST" && pathname === "/login") {
      if (rateLimited(request)) {
        send(response, 429, loginPage("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."));
        return;
      }
      const form = await readForm(request);
      const csrf = form.get("csrf_token") || "";
      const csrfExpiry = csrfTokens.get(csrf);
      csrfTokens.delete(csrf);
      if (!csrfExpiry || csrfExpiry < Date.now() || form.get("username") !== USERNAME || form.get("password") !== PASSWORD) {
        send(response, 401, loginPage("Login gagal. Periksa akun lab dan coba lagi."));
        return;
      }
      const now = Date.now();
      for (const [sessionId, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(sessionId);
      if (sessions.size >= 2000) {
        send(response, 503, loginPage("Sesi demo sedang penuh. Coba lagi nanti."));
        return;
      }
      const session = randomUUID();
      sessions.set(session, now + 30 * 60_000);
      setSessionCookie(response, session);
      response.writeHead(303, { Location: "/dashboard", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (["/dashboard", "/profile", "/reports"].includes(pathname) && request.method === "GET") {
      if (!isAuthenticated(request)) {
        response.writeHead(303, { Location: "/login", "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const labels = {
        "/dashboard": ["Dashboard", "Ringkasan lab", "Ini halaman dalam sesi demo.", ["/profile", "/reports"]],
        "/profile": ["Profil", "Profil demo", "Halaman profil ini tidak menampilkan informasi pribadi.", ["/dashboard", "/reports"]],
        "/reports": ["Laporan", "Laporan demo", "Halaman ini hanya berisi konten contoh.", ["/dashboard", "/profile"]],
      };
      const [title, heading, description, links] = labels[pathname];
      const navigation = links.map((href) => `<a class="secondary" href="${href}">${href.slice(1)}</a>`).join("");
      const content = `<p class="eyebrow">Halaman terautentikasi</p><h1>${heading}</h1><p>${description}</p><div class="links">${navigation}<a href="/">Beranda publik</a></div><form action="/logout" method="post"><button type="submit">Keluar</button></form>`;
      send(response, 200, page(title, content));
      return;
    }

    if (request.method === "POST" && pathname === "/logout") {
      const session = cookieValue(request, "lab_session");
      sessions.delete(session);
      const parts = ["lab_session=", "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
      if (PRODUCTION) parts.push("Secure");
      response.setHeader("Set-Cookie", parts.join("; "));
      response.writeHead(303, { Location: "/", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    send(response, 404, page("Tidak ditemukan", `<p class="eyebrow">404</p><h1>Halaman tidak ditemukan</h1><p>Rute demo ini tidak tersedia.</p><div class="links"><a href="/">Kembali ke beranda</a></div>`));
  } catch (error) {
    if (response.headersSent) return response.destroy();
    const status = error.statusCode || 500;
    send(response, status, page("Permintaan gagal", `<p class="eyebrow">${status}</p><h1>Permintaan tidak dapat diproses</h1><p>Silakan kembali dan coba lagi.</p><div class="links"><a href="/">Beranda</a></div>`));
  }
});

const host = process.env.HOST || (PRODUCTION ? "0.0.0.0" : "127.0.0.1");
server.listen(PORT, host, () => {
  console.log(`ZraCore Website Lab listening at http://${host}:${PORT}`);
  console.log(`Mode: ${PRODUCTION ? "production" : "local demo"}; demo credentials are ${PRODUCTION ? "disabled" : "labuser / lab-only-change-me"}.`);
});
