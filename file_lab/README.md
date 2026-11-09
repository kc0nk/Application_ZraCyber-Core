# ZraCore Local File & Malware Analysis Lab

Directory ini berisi sampel berkas simulasi artefak mencurigakan (*Simulated Malware / Webshell Sample*) untuk pengujian modul **File & Malware Analysis** ZraCore.

## Berkas dalam Lab:
- `suspicious_invoice.pdf`: Berkas dengan ekstensi `.pdf` yang menyematkan simulasi skrip *webshell PHP / command execution* (`eval`, `base64_decode`, `system`) di dalam struktur internalnya.

## Cara Pengujian:
1. Buka aplikasi ZraCore di HP, lalu navigasikan ke menu **File & Malware**.
2. Ketuk **Pilih Berkas Artefak**, lalu pilih `suspicious_invoice.pdf` dari direktori penyimpanan Anda.
3. Ketuk **Mulai Pemindaian Malware**.
4. Perhatikan bagaimana *Deep Parser Engine*, *Entropy Analysis*, dan *Embedded Source Code Detector* mendeteksi anomali pada berkas tersebut secara instan!
