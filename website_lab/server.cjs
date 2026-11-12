// Tujuan file: Mock website lab server nyata (PT ZraCore Nusantara Corporate Portal) dengan navigasi lengkap, form, API, dan 11 halaman kerentanan.
const { createServer } = require("node:http");
const { randomUUID } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const USERNAME = "admin";
const PASSWORD = "admin2026";

const sessions = new Map();
const articles = [
  { id: 1, title: "Transformasi Digital Korporat 2026", author: "Direktorat IT", date: "12 Nov 2026" },
  { id: 2, title: "Penerapan Standar Keamanan Siber ISO 27001", author: "Tim SecOps", date: "10 Nov 2026" }
];
const MAX_BODY_BYTES = 8192;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function securityHeaders(response, contentType = "text/html; charset=utf-8", customHeaders = {}) {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  for (const [k, v] of Object.entries(customHeaders)) {
    response.setHeader(k, v);
  }
}

function send(response, status, html, customHeaders = {}) {
  securityHeaders(response, "text/html; charset=utf-8", customHeaders);
  response.writeHead(status);
  response.end(html);
}

function sendJson(response, status, data) {
  securityHeaders(response, "application/json; charset=utf-8");
  response.writeHead(status);
  response.end(JSON.stringify(data));
}

function layout(title, content, isAuthenticatedUser = false) {
  const navbar = isAuthenticatedUser
    ? `<a href="/dashboard">Dashboard</a><a href="/dashboard/karyawan">Karyawan</a><a href="/dashboard/laporan">Laporan</a><a href="/dashboard/admin-tools">Admin Tools</a><a href="/dashboard/dokumen">Dokumen</a><a href="/dashboard/pengaturan">Pengaturan</a><form action="/logout" method="post" style="display:inline;"><button type="submit" style="background:#ef4444; padding:6px 12px; font-size:0.85rem;">Keluar</button></form>`
    : `<a href="/">Beranda</a><a href="/profil">Profil</a><a href="/layanan">Layanan</a><a href="/berita">Berita</a><a href="/kontak">Kontak</a><a href="/login" style="background:#2563eb; color:white; padding:6px 14px; border-radius:6px;">Login Karyawan</a>`;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · PT ZraCore Nusantara</title><link rel="stylesheet" href="/styles.css"></head>
<body>
<nav><a class="logo" href="/">PT ZRACORE NUSANTARA</a><div class="nav-links">${navbar}</div></nav>
<main>${content}</main>
<footer>&copy; 2026 PT ZraCore Nusantara. Seluruh hak cipta dilindungi. Portal Layanan Terpadu.</footer>
</body></html>`;
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
  response.setHeader("Set-Cookie", `lab_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`);
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = url.pathname;
    const query = url.searchParams;
    const isAuth = isAuthenticated(request);

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && pathname === "/styles.css") {
      const css = await readFile(path.join(__dirname, "styles.css"));
      securityHeaders(response, "text/css; charset=utf-8");
      response.writeHead(200);
      response.end(css);
      return;
    }

    // ==========================================
    // 5 HALAMAN PUBLIK (TANPA LOGIN)
    // ==========================================

    // 1. Beranda (XSS Reflection on query `q`)
    if (request.method === "GET" && pathname === "/") {
      const q = query.get("q") || "";
      const searchResult = q ? `<div class="card"><p>Hasil pencarian portal untuk: <strong>${q}</strong></p></div>` : "";
      send(response, 200, layout("Beranda Utama", `
        <div class="hero">
          <h1>Solusi Teknologi & Layanan Digital Terpadu</h1>
          <p>Mendukung transformasi digital perusahaan Anda dengan infrastruktur cloud aman, big data analytics, dan sistem keamanan siber enterprise.</p>
          <a class="btn-secondary" href="/profil">Pelajari Profil Perusahaan</a>
        </div>
        <div class="card">
          <h2>Cari Layanan & Informasi</h2>
          ${searchResult}
          <form action="/" method="get">
            <label>Kata Kunci Pencarian<input name="q" type="text" placeholder="Cth: Cloud, Keamanan..."></label>
            <button type="submit">Cari Data</button>
          </form>
        </div>
        <div class="grid">
          <div class="feature-box"><h3>Infrastruktur Cloud</h3><p>Server handal dengan ketersediaan tinggi 99.9%.</p></div>
          <div class="feature-box"><h3>Keamanan Siber</h3><p>Proteksi mutakhir terhadap ancaman malware dan ransomware.</p></div>
        </div>
      `, isAuth));
      return;
    }

    // 2. Profil Perusahaan (Info Disclosure Headers)
    if (request.method === "GET" && pathname === "/profil") {
      send(response, 200, layout("Profil Perusahaan", `
        <div class="card">
          <span class="badge">Tentang Kami</span>
          <h1>PT ZraCore Nusantara</h1>
          <p>Didirikan pada tahun 2020, PT ZraCore Nusantara adalah perusahaan teknologi terkemuka yang berfokus pada pengembangan perangkat lunak enterprise dan audit keamanan siber.</p>
          <h3>Visi</h3>
          <p>Menjadi pilar utama transformasi digital nasional yang aman dan terpercaya.</p>
          <h3>Misi</h3>
          <p>Memberikan layanan teknologi bermutu tinggi dan menjaga kerahasiaan data klien dengan standar tertinggi.</p>
        </div>
      `, isAuth), { "X-Powered-By": "ZraCore-Corporate-Server/4.2.1-production" });
      return;
    }

    // 3. Layanan & Produk (SQLi Simulation on parameter `service`)
    if (request.method === "GET" && pathname === "/layanan") {
      const service = query.get("service") || "all";
      let sqlError = "";
      if (service.includes("'") || service.toLowerCase().includes("or") || service.toLowerCase().includes("union")) {
        sqlError = `<div style="background:#fee2e2; color:#b91c1c; padding:12px; border-radius:8px; margin-top:12px; font-family:monospace;">[Database Error] SQL syntax error near '${escapeHtml(service)}' in query SELECT * FROM services WHERE category = '${escapeHtml(service)}'</div>`;
      }
      send(response, 200, layout("Layanan & Produk", `
        <div class="card">
          <span class="badge">Katalog</span>
          <h1>Layanan Perusahaan</h1>
          <p>Pilih kategori layanan yang ingin Anda telusuri.</p>
          ${sqlError}
          <form action="/layanan" method="get">
            <label>Filter Kategori Layanan<input name="service" type="text" value="${escapeHtml(service)}" placeholder="Cth: cloud, security, admin' OR '1'='1"></label>
            <button type="submit">Filter Layanan</button>
          </form>
        </div>
      `, isAuth));
      return;
    }

    // 4. Portal Berita (POST Comment / Report Form)
    if (request.method === "GET" && pathname === "/berita") {
      const list = articles.map(a => `<div style="border-bottom:1px solid #e2e8f0; padding:16px 0;"><h3>${escapeHtml(a.title)}</h3><p style="font-size:0.85rem; color:#64748b;">Oleh ${escapeHtml(a.author)} · ${escapeHtml(a.date)}</p></div>`).join("");
      send(response, 200, layout("Portal Berita", `
        <div class="card">
          <span class="badge">Berita Korporat</span>
          <h1>Artikel & Pengumuman</h1>
          ${list}
          <h3 style="margin-top:32px;">Kirim Komentar / Masukan</h3>
          <form action="/berita" method="post">
            <label>Nama Pengirim<input name="name" type="text" required></label>
            <label>Komentar<textarea name="comment" rows="3" required></textarea></label>
            <button type="submit">Kirim Komentar (POST)</button>
          </form>
        </div>
      `, isAuth));
      return;
    }

    if (request.method === "POST" && pathname === "/berita") {
      const form = await readForm(request);
      const name = form.get("name") || "";
      const comment = form.get("comment") || "";
      send(response, 200, layout("Komentar Diterima", `
        <div class="card">
          <h1>Terima Kasih, ${escapeHtml(name)}</h1>
          <p>Komentar Anda telah diterima dan akan dimoderasi.</p>
          <div class="links"><a class="btn-secondary" href="/berita">Kembali ke Berita</a></div>
        </div>
      `, isAuth));
      return;
    }

    // 5. Kontak & Pengaduan (LFI / Path Traversal Simulation on parameter `file`)
    if (request.method === "GET" && pathname === "/kontak") {
      const file = query.get("file") || "";
      let fileOutput = "";
      if (file.includes("passwd") || file.includes("win.ini")) {
        fileOutput = `<pre style="background:#0f172a; color:#38bdf8; padding:16px; border-radius:8px;">root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n[extensions]</pre>`;
      }
      send(response, 200, layout("Kontak Kami", `
        <div class="card">
          <span class="badge">Bantuan</span>
          <h1>Layanan Pengaduan & Kontak</h1>
          <p>Gunakan form pesan di bawah atau akses dokumen manual dengan parameter <code>?file=</code>.</p>
          ${fileOutput}
          <form action="/kontak" method="get">
            <label>Baca Dokumen Panduan (LFI Sim)<input name="file" type="text" placeholder="Cth: ../../../../etc/passwd"></label>
            <button type="submit">Muat Dokumen</button>
          </form>
        </div>
      `, isAuth));
      return;
    }

    // ==========================================
    // LOGIN ENDPOINT
    // ==========================================
    if (request.method === "GET" && pathname === "/login") {
      send(response, 200, layout("Login Karyawan", `
        <div class="card" style="max-width:480px; margin: 40px auto;">
          <h2>Portal Login Karyawan</h2>
          <p>Gunakan kredensial resmi perusahaan:<br><strong>admin</strong> / <strong>admin2026</strong></p>
          <form action="/login" method="post">
            <label>Username<input name="username" type="text" required></label>
            <label>Password<input name="password" type="password" required></label>
            <button type="submit">Masuk Sistem</button>
          </form>
        </div>
      `, isAuth));
      return;
    }

    if (request.method === "POST" && pathname === "/login") {
      const form = await readForm(request);
      if (form.get("username") !== USERNAME || form.get("password") !== PASSWORD) {
        send(response, 401, layout("Login Gagal", `<div class="card"><h2 style="color:#ef4444;">Login Gagal</h2><p>Username atau password salah.</p><a class="btn-secondary" href="/login">Coba Lagi</a></div>`));
        return;
      }
      const session = randomUUID();
      sessions.set(session, Date.now() + 30 * 60_000);
      setSessionCookie(response, session);
      response.writeHead(303, { Location: "/dashboard" });
      response.end();
      return;
    }

    // ==========================================
    // 6 HALAMAN TERAUTENTIKASI (SETELAH LOGIN)
    // ==========================================
    const authPages = ["/dashboard", "/dashboard/karyawan", "/dashboard/laporan", "/dashboard/admin-tools", "/dashboard/dokumen", "/dashboard/pengaturan"];
    if (authPages.includes(pathname)) {
      if (!isAuth) {
        response.writeHead(303, { Location: "/login" });
        response.end();
        return;
      }

      let content = "";
      if (pathname === "/dashboard") {
        content = `<h1>Dashboard Eksekutif</h1><p>Selamat datang kembali, Administrator.</p><div class="grid"><div class="feature-box"><h3>Total Karyawan</h3><p>1,240 Orang</p></div><div class="feature-box"><h3>Laporan Masuk</h3><p>14 Pending</p></div></div>`;
      } else if (pathname === "/dashboard/karyawan") {
        const id = query.get("id") || "1";
        content = `<h1>Manajemen Karyawan (IDOR Vuln)</h1><p>Menampilkan data pegawai untuk ID: <strong>${escapeHtml(id)}</strong></p><form action="/dashboard/karyawan" method="get"><label>Cari ID Pegawai<input name="id" type="text" value="${escapeHtml(id)}"></label><button type="submit">Periksa</button></form>`;
      } else if (pathname === "/dashboard/laporan") {
        const cat = query.get("cat") || "security";
        let sqlMsg = cat.includes("'") ? `<p style="color:red; font-family:monospace;">[SQLi Error in Reports] near '${escapeHtml(cat)}'</p>` : "";
        content = `<h1>Laporan Pengaduan (SQLi Vuln)</h1><p>Kategori: ${escapeHtml(cat)}</p>${sqlMsg}<form action="/dashboard/laporan" method="get"><label>Filter Kategori<input name="cat" type="text" value="${escapeHtml(cat)}"></label><button type="submit">Filter</button></form>`;
      } else if (pathname === "/dashboard/admin-tools") {
        const cmd = query.get("cmd") || "";
        let cmdRes = cmd ? `<pre style="background:#0f172a; color:#f87171; padding:14px;">uid=0(root) gid=0(root)\nCommand executed: ${escapeHtml(cmd)}</pre>` : "";
        content = `<h1>Panel Admin Tools (RCE Sim)</h1><p>Parameter 'cmd' untuk eksekusi server test.</p>${cmdRes}<form action="/dashboard/admin-tools" method="get"><label>Test Perintah Server<input name="cmd" type="text" placeholder="Cth: id"></label><button type="submit">Jalankan</button></form>`;
      } else if (pathname === "/dashboard/dokumen") {
        const doc = query.get("doc") || "readme.txt";
        let docContent = doc.includes("passwd") ? `<pre style="background:#000; color:#34d399; padding:12px;">root:x:0:0:root:/root:/bin/bash</pre>` : "";
        content = `<h1>Arsip Dokumen (Path Traversal)</h1><p>Parameter 'doc': ${escapeHtml(doc)}</p>${docContent}<form action="/dashboard/dokumen" method="get"><label>Nama Berkas Arsip<input name="doc" type="text" value="${escapeHtml(doc)}"></label><button type="submit">Buka Berkas</button></form>`;
      } else if (pathname === "/dashboard/pengaturan") {
        content = `<h1>Pengaturan Akun (CSRF)</h1><form action="/dashboard/pengaturan" method="post"><label>Email Admin<input name="email" type="email" value="admin@zracore.co.id"></label><button type="submit">Simpan (POST)</button></form>`;
      }

      send(response, 200, layout("Dashboard", content, true));
      return;
    }

    if (request.method === "POST" && pathname === "/dashboard/pengaturan") {
      if (!isAuth) {
        response.writeHead(303, { Location: "/login" });
        response.end();
        return;
      }
      send(response, 200, layout("Pengaturan", `<div class="card"><h1>Berhasil Disimpan</h1><p>Pengaturan akun diperbarui.</p><div class="links"><a class="btn-secondary" href="/dashboard/pengaturan">Kembali</a></div></div>`, true));
      return;
    }

    if (request.method === "POST" && pathname === "/logout") {
      const session = cookieValue(request, "lab_session");
      sessions.delete(session);
      response.setHeader("Set-Cookie", "lab_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
      response.writeHead(303, { Location: "/" });
      response.end();
      return;
    }

    send(response, 404, layout("Tidak Ditemukan", `<div class="card"><h1>404 - Halaman Tidak Ditemukan</h1><p>URL yang Anda tuju tidak tersedia.</p><div class="links"><a class="btn-secondary" href="/">Kembali ke Beranda</a></div>`));
  } catch (error) {
    if (response.headersSent) return response.destroy();
    send(response, 500, layout("Kesalahan Server", `<div class="card"><h1>500 - Kesalahan Internal</h1><p>Gagal memproses permintaan.</p></div>`));
  }
});

const host = process.env.HOST || "127.0.0.1";
server.listen(PORT, host, () => {
  console.log(`PT ZraCore Nusantara Corporate Portal running at http://${host}:${PORT}`);
  console.log(`- 5 Halaman Publik & 6 Halaman Terautentikasi (Total 11 Halaman Nyata).`);
});
