function applyAuthRules(url, htmlContent, headers = {}) {
  const findings = [];
  const setCookies = String(headers["set-cookie"] || "");

  if (setCookies) {
    if (!setCookies.toLowerCase().includes("httponly")) {
      findings.push({
        title: "Session Cookie Missing HttpOnly Flag",
        severity: "Medium",
        cwe: "CWE-1004",
        evidence: ["Set-Cookie header without HttpOnly attribute"],
        location: url,
        check: "Auth & Session - Cookie Security",
        summary: "Cookie sesi tidak menggunakan atribut HttpOnly, berisiko dicuri oleh skrip JavaScript liar jika terjadi XSS."
      });
    }
    if (!setCookies.toLowerCase().includes("secure") && url.startsWith("https:")) {
      findings.push({
        title: "Session Cookie Missing Secure Flag over HTTPS",
        severity: "Medium",
        cwe: "CWE-614",
        evidence: ["Set-Cookie header without Secure attribute"],
        location: url,
        check: "Auth & Session - Cookie Transport",
        summary: "Cookie sesi disetel pada koneksi HTTPS tanpa flag Secure, berisiko terkirim melalui koneksi HTTP cleartext."
      });
    }
  }

  return findings;
}

module.exports = { applyAuthRules };
