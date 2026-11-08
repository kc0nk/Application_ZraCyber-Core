# ZraCore Local Vulnerable Website Security Lab

Directory ini berisi aplikasi web uji coba rentan (*Vulnerable Web App*) untuk pengujian modul **Website Penetration Testing** ZraCore.

## Berkas dalam Lab:
- `vulnerable_app.cjs`: Server Node.js/HTTP lokal dengan celah keamanan sengaja disematkan (SQLi, Reflected XSS, Weak Headers, Sensitive File Exposure).

## Celah Keamanan yang Tersedia:
- `/search?q=`: Reflected Cross-Site Scripting (XSS).
- `/login.php?user=`: SQL Injection (SQLi) parameter bypass.
- `/.env` & `/config.json`: Informasi kredensial sensitif terbuka.

## Cara Pengujian:
1. Jalankan server lab website lokal:
   ```bash
   node website_lab/vulnerable_app.cjs
   ```
2. Masukkan URL `http://127.0.0.1:8081` pada menu **Website Audit** di aplikasi ZraCore mobile.
3. Jalankan pemindaian untuk melihat hasil audit penetrasi web secara instan!
