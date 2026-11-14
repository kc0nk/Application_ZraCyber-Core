# ZraCore Local VPS & Server Security Lab

Directory ini berisi simulasi lingkungan server VPS rentan untuk keperluan pengujian dan demonstrasi modul **VPS & Server Security** ZraCore.

## Berkas dalam Lab:
- `simulated_target.json`: Konfigurasi simulasi port terbuka, service, dan kerentanan host.
- `mock_vps_server.cjs`: Server uji coba lokal untuk mensimulasikan respons audit VPS.

## Cara Pengujian:
1. Jalankan simulasi lab lokal:
   ```bash
   node vps_lab/mock_vps_server.cjs
   ```
2. Pastikan aplikasi mobile tersambung ke Desktop API yang berjalan pada komputer yang sama dengan lab. Pemindaian dijalankan oleh Desktop API, bukan langsung dari HP.
3. Pada menu **VPS & Server**, pilih **Tanpa Login**. Masukkan host `127.0.0.1` di kolom **IP Address VPS / Host** dan `8080` di kolom **Port SSH** (kolom ini dipakai sebagai port target scan).
4. Jalankan inspeksi. Port 8080 akan muncul sebagai observasi informasi dan indikator dari `simulated_target.json` akan muncul sebagai temuan simulasi untuk latihan.

URL `http://127.0.0.1:8080/target` adalah endpoint HTTP untuk konfigurasi simulasi. Desktop API membacanya hanya ketika target adalah loopback. Di formulir VPS, URL tersebut dipisah menjadi host `127.0.0.1` dan port `8080`; jangan masukkan skema `http://` atau path `/target` ke kolom IP. Laporan akan memberi label bahwa indikator tersebut berasal dari fixture lab, bukan pemeriksaan host nyata.
