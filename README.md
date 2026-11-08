# ZRACORE CYBER INTELLIGENCE & PENETRATION TESTING PLATFORM v3.0

![ZraCore Banner](desktop/src/assets/logo.png)

**ZraCore** adalah platform keamanan siber (*cyber security*), audit penetrasi (*penetration testing*), intelijen jejak digital (*OSINT reconnaissance*), dan reverse engineering berkas biner modern yang menggabungkan aplikasi seluler Android (React Native / Expo) dengan pengendali utama desktop (Electron / Node.js Controller) yang ditenagai oleh mesin **Groq AI (openai/gpt-oss-120b)**.

---

## 📌 DAFTAR ISI
1. [Penjelasan Aplikasi](#-penjelasan-aplikasi)
2. [Fitur Unggulan](#-fitur-unggulan)
3. [Arsitektur Sistem](#-arsitektur-sistem)
4. [Instalasi Desktop Controller (Arch, Kali, Windows)](#-instalasi-desktop-controller)
5. [Kompilasi Release APK Mobile](#-kompilasi-release-apk-mobile)
6. [Cara Penggunaan & Lab Uji Coba](#-cara-penggunaan--lab-uji-coba)
7. [Struktur Proyek](#-struktur-proyek)

---

## 🛡️ PENJELASAN APLIKASI

> [!IMPORTANT]
> **PERINGATAN INTEGRITAS DATA FAKTUAL (NON-VISUAL DISCLAIMER)**:  
> Seluruh hasil analisis, audit keamanan, laporan OSINT, dan inspeksi biner pada platform ZraCore merupakan **DATA FAKTUAL YANG OBJEKTIF** (berdasarkan sintesis jejak digital publik, indeks dokumen resmi, metadata biner, dan kalkulasi matematis entropi). Platform ini **TIDAK MENGGUNAKAN HALUSINASI DATA VISUAL FIKTIF** atau tebakan gambar yang tidak terverifikasi.

ZraCore dirancang khusus untuk *Security Engineers, Penetration Testers, Bug Bounty Hunters, dan Digital Forensic Investigators* untuk melakukan audit keamanan terpadu di berbagai permukaan serangan (*attack surface*):

- **Cross-Platform Multi-Tool**: Mengintegrasikan pemeriksaan Website, Aplikasi Mobile, Berkas/Payload, Identitas OSINT, Server VPS, hingga Kriptografi dalam satu dasbor terpadu.
- **Orkestrasi AI Groq Cloud**: Memanfatkan kecerdasan buatan Groq AI (`openai/gpt-oss-120b`) untuk menyusun sintesis intelijen, korelasi kerentanan CVE/CWE, analisis risiko, serta kode perbaikan (*remediation patch*).
- **Offline & Robust Fallback Engine**: Setiap modul dilengkapi penanganan galat jaringan tangguh yang menjamin pemindaian tetap dapat berjalan mandiri di perangkat seluler secara stabil.

---

## 🚀 FITUR UNGGULAN

### 🌐 01. Website Penetration Testing
- Pemindaian kerentanan aplikasi web otomatis 13-tahap (CWE/CVE correlation).
- Deteksi celah keamanan utama: **SQL Injection (SQLi), Cross-Site Scripting (XSS), Insecure Transport (TLS), CSRF, Header Security, dan Miskonfigurasi Server**.
- Dilengkapi **`website_lab/`** lokal (`http://127.0.0.1:8081`) untuk simulasi penetrasi web.

### 📱 02. App Mobile Audit (Android & iOS)
- Inspeksi statis biner berkas **APK, IPA, iOS, dan EXE** berbasis standar kepatuhan **OWASP MASTG / MASVS**.
- Analisis dinamis menyesuaikan tipe aplikasi (Perbankan/Fintech, Game, atau MOD/Crack).
- Deteksi pemalsuan tanda tangan (*signature tampering*), perizinan berbahaya, dan penyimpanan kredensial plaintext.

### 📂 03. File & Malware Analysis (Deep Parser Engine)
- Pemindaian biner dan payload multi-tahap.
- **Kalkulasi Entropi Shannon**: Mengukur tingkat keacakan biner untuk mendeteksi payload terenkripsi atau *obfuscated malware*.
- **Indicator Engine**: Ekstraksi string URL eksternal, Alamat IP hardcoded, path direktori sistem, dan perintah shell mencurigakan (`powershell`, `eval`, `cmd.exe`).
- **Embedded Source Code Detector**: Mendeteksi potongan kodingan tersembunyi (PHP, JavaScript, Python, Shell Script, SQL Injection).

### 🔍 04. OSINT Social Media & Identity Reconnaissance
- **Mode Dual-Reconnaissance**:
  - **Mode Nama Lengkap**: Pencarian tepat nama di Google Exact Search, LinkedIn Directory, Facebook Public, Berita/Media Mention, dan Publikasi Dokumen Scribd.
  - **Mode Username (@handle)**: Pemetaan profil di 10 platform media sosial utama (**Instagram, Twitter/X, Facebook, Threads, LinkedIn, GitHub, Scribd, Pinterest, Unsplash, Pxhere**).
- **Sintesis Dossier AI**: Groq AI merangkum deskripsi intelijen riwayat akademis, karir, dan jejak digital publik dalam format Markdown interaktif.

### 🖥️ 05. VPS & Server Security Orchestrator
- **Mode Akses Ganda**:
  - **Tanpa Login (Pre-Auth)**: Audit permukaan eksternal, eksposur port terbuka, hardening SSH, dan konfigurasi firewall.
  - **Dengan Login (Post-Auth)**: Audit terautentikasi dengan Password SSH & Form Login untuk mendeteksi IDOR, Privilege Escalation, dan skrip *webshell/backdoor* di area admin dashboard.
- Dilengkapi **`vps_lab/`** lokal (`127.0.0.1:8080`) untuk simulasi pengujian server rentan.

### 🔐 06. Cryptography & Cipher Core
- Operasi Kriptografi Simetris **AES-256-GCM** dengan **Scrypt Key Derivation Function (KDF)**.
- Mode Enkripsi (Plaintext ➔ Ciphertext Base64 + Nonce + Auth Tag) dan Dekripsi terautentikasi.
- Bebas metrik kerentanan; murni untuk verifikasi integritas data dan kalkulasi cipher.

### 📄 07. Laporan Resmi PDF (Official Audit Reports)
- Penggabungan riwayat audit dari seluruh modul dalam satu dokumen resmi.
- Ekspor PDF A4 terstruktur (*Header Resmi, Tabel Metadata, Sintesis AI, Kartu Temuan dengan Badge Keparahan, dan Tabel Direct Link*).

### 💻 08. Desktop Controller & Live Map
- Pemantauan perangkat terhubung secara *real-time* (polling 1.5s).
- **Peta Live (Leaflet Map)**: Menampilkan posisi GPS perangkat terhubung dengan warna indikator dinamis (Biru = Terdaftar, Merah = Anomali).
- **OTA Mobile Update**: Publikasi dan pengiriman update APK rilis baru langsung dari aplikasi Desktop ke HP.

---

## 💻 RINCIAN FUNGSI DESKTOP CONTROLLER

Aplikasi Desktop Controller (Electron / Node.js) berfungsi sebagai pusat komando dan server pengolah utama untuk seluruh perangkat mobile:

1. **Pusat Server HTTP API (Port 4317)**:
   - Melayani permintaan pemindaian dari HP untuk modul Website Pentest, App Audit, File Malware, OSINT, VPS, dan Kriptografi secara aman.
   - Mendukung rute publik terobosan terowongan (*Bypass Ngrok Header*) untuk pengujian jarak jauh via internet seluler.

2. **Peta Live (Leaflet GPS Live Map)**:
   - Menampilkan posisi geografis real-time seluruh perangkat HP yang terhubung.
   - **Indikator Warna Otomatis 3 Status**: 
     - **BIRU (`#3b82f6`)**: Perangkat Terdaftar Resmi (*Registered Device*).
     - **KUNING (`#eab308`)**: Perangkat Akun Demo Juri (*Judge Demo Account*).
     - **MERAH (`#ef4444`)**: Perangkat Anomali / Belum Terdaftar (*Anomalous Device*).
   - Pembaruan status warna dan koordinat berjalan secara *real-time* tanpa perlu me-restart aplikasi.

3. **Pengelolaan Perangkat & Akses Keamanan (Device Manager)**:
   - Manajemen daftar perangkat terdaftar, pembatasan akses, serta fitur pemblokiran (*block/unblock device*) instant.
   - Pembuatan kunci otorisasi API Key dinamis untuk perangkat mobile baru.

4. **Log & Laporan Gabungan Multi-Device**:
   - Mengumpulkan seluruh hasil audit (*Write-up*) dari berbagai HP yang terhubung secara otomatis.
   - Tampilan kartu laporan yang dapat diperluas (*expandable details*) untuk melihat detail PoC, tautan referensi OSINT, dan rekomendasi perbaikan.

5. **Pusat Publikasi Update APK Mobile (OTA Release Publisher)**:
   - Fitur `⇧ Update APK mobile` memungkinkan admin mempublikasikan file APK rilis baru langsung dari laptop ke seluruh HP yang terhubung secara *Over-The-Air (OTA)*.

6. **Asisten AI Chat & Eksekusi Suara (Voice & AI Chat)**:
   - Dasbor konsultasi keamanan berbasis Groq AI dengan fitur perekaman dan pemutaran suara interaktif.

7. **Fitur Pemblokiran & Uninstall Paksa Remote (Remote Force Wipe & Device Revocation)**:
   - Apabila perangkat seluler terdeteksi melakukan tindakan anomali, disalahgunakan, atau hilang/dicuri, admin desktop dapat mengaktifkan **Blokir & Revokasi Paksa**.
   - Sistem secara otomatis mengirimkan perintah revokasi instan ke perangkat HP target, mengunci akses antarmuka seluler, menghapus riwayat kredensial lokal (*remote wipe*), dan memutus otorisasi aplikasi secara penuh.

---

## 🏗️ ARSITEKTUR SISTEM

```
┌─────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native / Expo)     │
│  [Web Pentest] [App Audit] [File] [OSINT] [VPS] [Crypto]│
└────────────────────────────┬────────────────────────────┘
                             │ REST API / HTTP (Bypass Ngrok)
                             ▼
┌─────────────────────────────────────────────────────────┐
│               DESKTOP CONTROLLER (Electron / Node.js)   │
│            Server HTTP Port 4317 · Live Map · History   │
└────────────────────────────┬────────────────────────────┘
                             │ HTTPS API Call
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  GROQ CLOUD AI ENGINE                   │
│             Model: openai/gpt-oss-120b                  │
└─────────────────────────────────────────────────────────┘
```

---

> [!TIP]
> **KUNCI GROQ API RESMI (DEFAULT ADMIN KEY)**:  
> Platform ZraCore sudah terkonfigurasi secara bawaan (*pre-configured*) dengan kunci API resmi berikut:  
> `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`

## 💻 INSTALASI DESKTOP CONTROLLER

### A. Arch Linux / Manjaro:
```bash
# 1. Update paket & instal Node.js, npm, serta dependensi Electron
sudo pacman -Syu nodejs npm git libxcrypt-compat

# 2. Cloning & Masuk ke direktori desktop
cd desktop

# 3. Instal dependensi npm
npm install

# 4. Jalankan Desktop Controller
npm start
```

### B. Kali Linux / Debian / Ubuntu:
```bash
# 1. Update paket & instal Node.js, npm, dan pustaka GUI Linux
sudo apt update && sudo apt install -y nodejs npm git libgtk-3-0 libnotify4 libnss3 libxss1 libasound2

# 2. Masuk ke direktori desktop
cd desktop

# 3. Instal dependensi npm
npm install

# 4. Jalankan Desktop Controller
npm start
```

### C. Windows 10 / 11 (PowerShell / Command Prompt):
```powershell
# 1. Pastikan Node.js terpasang (Download installer dari https://nodejs.org)
node -v

# 2. Masuk ke direktori desktop melalui PowerShell
cd desktop

# 3. Instal dependensi npm
npm install

# 4. Jalankan Desktop Controller
npm start
```

---

## 📱 KOMPILASI RELEASE APK MOBILE

Perintah resmi untuk melakukan *build* APK rilis Android tanpa galat:

```bash
cd android
export PATH=$PATH:/usr/bin:/usr/local/bin
env -u ANDROID_PREFS_ROOT JAVA_TOOL_OPTIONS="--enable-native-access=ALL-UNNAMED" ./gradlew assembleRelease
```
> **Lokasi Hasil Build APK:**  
> `android/app/build/outputs/apk/release/app-release.apk`

---

## 📖 CARA PENGGUNAAN & LAB UJI COBA

### 1. Menghubungkan Aplikasi HP ke Laptop:
1. Jalankan Desktop Controller (`npm start`) di laptop Anda.
2. Jika menggunakan Ngrok, salin URL Ngrok terbaru atau gunakan URL Ngrok resmi berikut pada tab **Profil** HP:
   ```
   https://popular-shorten-imperial.ngrok-free.dev
   ```
3. Di HP, buka tab **Profil**, tempelkan URL API dan API Key Desktop, lalu klik **Simpan & Hubungkan**.

### 2. Menguji Modul Website Pentest (Lab Web Lokal):
1. Jalankan server lab website rentan di terminal laptop:
   ```bash
   node website_lab/vulnerable_app.cjs
   ```
2. Buka menu **Website Audit** di HP.
3. Masukkan target URL `http://127.0.0.1:8081`, lalu tekan **Mulai Audit Penetrasi Web**.

### 3. Menguji Modul VPS & Server Security (Lab VPS Lokal):
1. Jalankan server simulasi lab VPS di terminal laptop:
   ```bash
   node vps_lab/mock_vps_server.cjs
   ```
2. Buka menu **VPS & Server** di HP.
3. Pilih mode **Tanpa Login** atau **Dengan Login**.
4. Masukkan IP `127.0.0.1`, Port `22`, User `root`, lalu tekan **Mulai Inspeksi VPS**.

### 4. Menguji OSINT Identitas & Username:
1. Buka menu **OSINT Social Media** di HP.
2. Masukkan **Nama Lengkap** (*misal: `RUBBY WIRASSMARA`*) atau **Username** (*misal: `@zhafran`*).
3. Tekan **Mulai Lacak Target** untuk melihat sintesis intelijen AI dan 10+ tautan profil media sosial.

---

## 👥 AKUN DEMO RESMI UNTUK JURI & PENGUJIAN MULTI-HP

Platform ZraCore menyediakan **6 Akun Demo Khusus Juri** yang dapat langsung dipilih dari tab **Profil** aplikasi mobile untuk pengujian instan tanpa perlu mendaftarkan API key manual:

1. 🛡️ **Drs. Zhafran Zky (Lead Auditor)** — *Chief Cyber Security Auditor & Lead Penetration Tester*  
   - Key: `zra_demo_lead_auditor_2026_key`
2. 🌐 **Rubby Wirassmara (Web Specialist)** — *Senior Web Security & Bug Bounty Specialist*  
   - Key: `zra_demo_web_specialist_2026_key`
3. 📱 **Dr. Dzaky (Mobile Forensic Lead)** — *Android & iOS Binary Reverse Engineer*  
   - Key: `zra_demo_mobile_forensic_2026_key`
4. 📂 **Auditor DFIR (Malware Specialist)** — *Digital Forensics & Incident Response Specialist*  
   - Key: `zra_demo_malware_dfir_2026_key`
5. 🔍 **Investigator OSINT (Recon Lead)** — *Social Media & Identity Intelligence Analyst*  
   - Key: `zra_demo_osint_recon_2026_key`
6. 🖥️ **Judge Infra (Server Inspector)** — *Infrastructure & Cloud Security Inspector*  
   - Key: `zra_demo_vps_infra_2026_key`

> [!NOTE]
> **Dukungan Multi-HP Simultan**:  
> Seluruh 6 Akun Demo juri dapat digunakan oleh **beberapa HP fisik yang berbeda secara bersamaan (*simultaneous multi-device*)** tanpa saling menendang atau memblokir satu sama lain. Setiap perangkat akan secara otomatis muncul di Peta Live Desktop Controller.

---

## 📁 STRUKTUR PROYEK

```
Application/
├── app/                      # Aplikasi Mobile (Expo Router)
│   ├── (tabs)/               # Tab Navigasi (Ringkasan, Security, Laporan, Chat, Profil)
│   ├── tools_website.tsx     # Modul Website Penetration Testing
│   ├── tools_app.tsx         # Modul App Mobile Audit
│   ├── tools_file.tsx        # Modul File & Malware Analysis
│   ├── tools_osint.tsx       # Modul OSINT Social Media & Identity
│   ├── tools_vps.tsx         # Modul VPS & Server Security
│   └── tools_cryptography.tsx# Modul Kriptografi & Cipher
├── desktop/                  # Dasbor Desktop Controller (Electron)
│   ├── src/
│   │   ├── api.cjs           # HTTP API Server (Port 4317) & Engine Groq AI
│   │   ├── main.cjs          # Electron Main Process & IPC Handlers
│   │   ├── renderer.js       # Desktop UI Logic & Live Map Leaflet
│   │   └── index.html        # Dasbor Desktop UI
├── website_lab/              # Lab Simulasi Website Rentan (SQLi, XSS, .env)
│   ├── vulnerable_app.cjs    # Server Web Target Simulasi Rentan
│   └── README.md             # Panduan Pengujian Web Lab
├── vps_lab/                  # Lab Simulasi VPS Lokal
│   ├── mock_vps_server.cjs   # Server Target Simulasi VPS
│   └── simulated_target.json # Konfigurasi Target Rentan
├── android/                  # Proyek Native Android (Gradle)
└── README.md                 # Dokumentasi Resmi Proyek
```

---

## ⚖️ PERINGATAN HUKUM & HAK CIPTA (LEGAL COPYRIGHT WARNING)

> [!CAUTION]
> **DILARANG KERAS MENGGANDAKAN, MENDISTRIBUSIKAN, ATAU MEMPERJUALBELIKAN TANPA IZIN RESMI PEMILIK HAK CIPTA**:  
> Seluruh kode sumber, arsitektur sistem, rancangan antarmuka, dan dokumentasi proyek **ZraCore Cyber Intelligence Platform** dilindungi secara penuh oleh Undang-Undang Hak Cipta Republik Indonesia. Setiap instansi, organisasi, maupun perorangan yang melakukan penyalinan, pemalsuan, atau penggunaan komersial tanpa izin tertulis dari pemilik hak cipta akan ditindak tegas melalui jalur hukum:
> 
> - **Gugatan Perdata (UU Hak Cipta Pasal 95)**: Pemilik hak cipta berhak mengajukan gugatan ganti rugi materiil maupun immateriil ke Pengadilan Niaga atas setiap penggunaan tanpa izin.
> - **Sanksi Pidana Komersial (UU Hak Cipta Pasal 113)**: Jika proyek/kode sumber ini didistribusikan, diduplikasi, atau dijual secara ilegal untuk tujuan komersial, pelanggar terancam **pidana penjara paling lama 4 (empat) tahun** dan/atau **denda hingga Rp1.000.000.000,- (satu miliar rupiah)**.

---

**ZraCore Cyber Intelligence & Penetration Testing Platform © 2026**  
*Empowering Cyber Defense & Forensics with Advanced AI Orchestration.*
