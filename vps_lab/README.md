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
2. Masukkan IP `127.0.0.1` pada menu **VPS & Server** di aplikasi ZraCore mobile.
3. Jalankan pemindaian untuk melihat hasil audit keamanan server secara instan!
