function applyExternalRules(externalData) {
  const findings = [];
  const openPorts = Array.isArray(externalData.openPorts) ? externalData.openPorts : [];

  if (openPorts.includes(22)) {
    findings.push({
      title: "SSH Port 22 Exposed to Public Internet",
      severity: "Medium",
      cwe: "CWE-284",
      evidence: ["Port 22 is open on external IP"],
      location: externalData.ip,
      check: "External Rule - Port Exposure",
      summary: "Port SSH terbuka ke publik, disarankan menggunakan port non-standard atau pembatasan firewall (fail2ban)."
    });
  }

  // Port terbuka selain SSH dicatat sebagai observasi, bukan otomatis dianggap rentan.
  for (const port of openPorts.filter((value) => value !== 22)) {
    findings.push({
      title: `Port ${port} Terbuka`,
      severity: "Info",
      evidence: [`Koneksi TCP ke port ${port} berhasil dibuat.`],
      location: `${externalData.ip}:${port}`,
      check: "External Rule - Open Port Observation",
      summary: `Layanan pada port ${port} dapat dijangkau dari mesin pemindai. Port terbuka saja bukan bukti kerentanan; pastikan layanan tersebut memang diperlukan dan dibatasi sesuai kebutuhan.`
    });
  }

  const labProfile = externalData.labProfile;
  if (labProfile && Array.isArray(labProfile.anomalies)) {
    const labFindingDetails = {
      cron: {
        title: "Simulasi: Persistence melalui Scheduled Task",
        summary: "Fixture lab memuat cron job yang disimulasikan mengunduh payload eksternal. Periksa sumber job, jadwal, dan tujuan unduhan pada skenario latihan.",
        recommendation: "Nonaktifkan job simulasi dan verifikasi integritas scheduled task pada server latihan.",
      },
      webshell: {
        title: "Simulasi: Web Shell pada Direktori Upload",
        summary: "Fixture lab menandai berkas web shell pada direktori upload. Ini adalah indikator skenario, bukan bukti berkas tersebut ada pada host nyata.",
        recommendation: "Karantina berkas simulasi, batasi eksekusi skrip di direktori upload, dan validasi tipe berkas.",
      },
      malware: {
        title: "Simulasi: Artefak Malware di Direktori Sementara",
        summary: "Fixture lab memuat indikator artefak malware untuk latihan respons insiden.",
        recommendation: "Telusuri proses dan persistensi terkait pada lab, lalu hapus artefak hanya setelah bukti latihan dikumpulkan.",
      },
      permission: {
        title: "Simulasi: Izin Direktori Terlalu Terbuka",
        summary: "Fixture lab menandai direktori upload dengan izin tulis yang terlalu luas.",
        recommendation: "Gunakan izin minimum yang diperlukan dan hindari akses tulis untuk semua pengguna.",
      },
    };

    for (const anomaly of labProfile.anomalies) {
      const detail = labFindingDetails[String(anomaly.type || "").toLowerCase()];
      if (!detail) continue;

      findings.push({
        title: detail.title,
        severity: ["critical", "high", "medium", "low"].includes(String(anomaly.risk || "").toLowerCase())
          ? String(anomaly.risk).charAt(0).toUpperCase() + String(anomaly.risk).slice(1).toLowerCase()
          : "Info",
        evidence: [anomaly.path ? `Path simulasi: ${anomaly.path}` : `Tipe indikator: ${anomaly.type}`],
        location: "VPS Lab · data simulasi",
        check: "VPS Lab Simulation Rule",
        summary: detail.summary,
        recommendation: detail.recommendation,
        simulated: true,
      });
    }

    if (labProfile.default_credentials?.username) {
      findings.push({
        title: "Simulasi: Kredensial Default Tersedia di Fixture",
        severity: "High",
        evidence: [`Fixture menyediakan akun simulasi '${String(labProfile.default_credentials.username)}'; nilai password tidak ditampilkan.`],
        location: "VPS Lab · data simulasi",
        check: "VPS Lab Simulation Rule",
        summary: "Konfigurasi latihan memuat kredensial default. Temuan ini berasal dari fixture lokal dan bukan hasil autentikasi ke host.",
        recommendation: "Ganti kredensial default pada skenario lab sebelum menggunakannya untuk latihan autentikasi.",
        simulated: true,
      });
    }
  }

  return findings;
}
module.exports = { applyExternalRules };
