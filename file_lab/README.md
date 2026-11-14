# ZraCore Local File & Malware Analysis Lab

Directory ini berisi sampel berkas simulasi artefak mencurigakan (*Simulated Malware / Webshell Sample*) untuk pengujian modul **File & Malware Analysis** ZraCore.

## Berkas dalam Lab:
- `suspicious_invoice.pdf`: Berkas dengan ekstensi `.pdf` yang menyematkan simulasi skrip *webshell PHP / command execution* (`eval`, `base64_decode`, `system`) di dalam struktur internalnya.
- `inert_indicator_sample.pdf`: PDF valid yang hanya memuat kata indikator sebagai komentar PDF untuk menguji deteksi statis. Tidak ada script atau aksi yang dijalankan.

## Cara Pengujian:
1. Buka aplikasi ZraCore di HP, lalu navigasikan ke menu **File & Malware**.
2. Ketuk **Pilih Berkas Artefak**, lalu pilih `inert_indicator_sample.pdf` untuk uji aman detektor string, atau `suspicious_invoice.pdf` untuk sampel webshell simulasi yang sudah ada.
3. Ketuk **Mulai Pemindaian Malware**.
4. Perhatikan bagaimana *Deep Parser Engine*, *Entropy Analysis*, dan *Embedded Source Code Detector* mendeteksi anomali pada berkas tersebut secara instan!
