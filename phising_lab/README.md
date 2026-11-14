# Phishing Indicator Lab

Lab ini menyajikan halaman tiruan yang ditandai sebagai simulasi. Form demo membatalkan submit dan tidak mengirim atau menyimpan nilai input. Gunakan data contoh saja.

## Menjalankan

```bash
node phising_lab/server.cjs
```

Server hanya bind ke `127.0.0.1:8091` dan menyajikan halaman di `/login-demo`.

## Mencoba dari aplikasi

1. Jalankan Desktop Controller dan server lab pada komputer yang sama.
2. Di aplikasi, buka **Phishing Check** lalu tekan **Isi URL Lab Phishing Lokal**.
3. Tekan **Periksa Indikator Phishing**. Mode lab hanya mengizinkan alamat demo tetap `http://127.0.0.1:8091/login-demo`.
4. Hasil yang diharapkan adalah indikasi tinggi berdasarkan halaman latihan, host IP, judul brand yang tidak cocok dengan domain, dan form password yang mengarah ke domain `.invalid`.

Pemindaian biasa tetap menolak alamat loopback/private. Pengecualian hanya berlaku ketika mode lab dipilih dan host, port, serta path cocok persis dengan endpoint demo di atas. Tidak ada endpoint yang menerima kredensial.
