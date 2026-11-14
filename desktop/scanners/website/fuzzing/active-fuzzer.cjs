const sqliPayloads = require("../payloads/sqli-payloads.cjs");
const xssPayloads = require("../payloads/xss-payloads.cjs");
const lfiPayloads = require("../payloads/lfi-payloads.cjs");
const rcePayloads = require("../payloads/rce-payloads.cjs");
const ssrfPayloads = require("../payloads/ssrf-payloads.cjs");
const graphqlPayloads = require("../payloads/graphql-payloads.cjs");

async function runActiveFuzzer(pages, origin, onFinding = () => {}, log = () => {}) {
  const findings = [];
  const commonParams = ["id", "q", "search", "page", "cat", "s", "query", "view", "item", "user", "action", "file", "path", "url", "token", "report", "comment", "message"];

  for (const page of pages) {
    if (!page.reachable || !page.url) continue;

    let targetUrl;
    try {
      targetUrl = new URL(page.url);
    } catch {
      continue;
    }

    let params = Array.from(targetUrl.searchParams.keys());
    if (params.length === 0) {
      params = commonParams;
    }

    log(`[FUZZER] Menguji semua metode HTTP & payload pada: ${page.url}`);

    // 1. OPTIONS Method Test
    try {
      const optRes = await globalThis.fetch(page.url, {
        method: "OPTIONS",
        headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0" },
        signal: AbortSignal.timeout(3000)
      }).catch(() => null);

      if (optRes) {
        const allowHeader = optRes.headers.get("allow") || optRes.headers.get("access-control-allow-methods") || "";
        if (allowHeader && (allowHeader.includes("PUT") || allowHeader.includes("DELETE") || allowHeader.includes("TRACE"))) {
          const finding = {
            title: "Potentially Risky HTTP Methods Enabled (OPTIONS)",
            severity: "Low",
            cwe: "CWE-749",
            evidence: [`Allowed Methods Header: ${allowHeader}`],
            location: page.url,
            check: "Active Fuzzer - HTTP OPTIONS Method Analysis",
            summary: `Server mengonfirmasi dukungan metode HTTP berisiko pada patch ${page.url} melalui header Allow: ${allowHeader}.`,
            poc: `curl -X OPTIONS -I "${page.url}"`,
            remediation: "Nonaktifkan metode HTTP yang tidak diperlukan (seperti PUT, DELETE, TRACE) pada konfigurasi web server."
          };
          findings.push(finding);
          onFinding(finding);
        }
      }
    } catch {}

    // 2. Test URL Parameters across ALL HTTP Methods
    for (const param of params) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]) {

        // --- SQLi Payloads ---
        for (const item of sqliPayloads) {
          try {
            log(`[PAYLOAD: SQLi] Method: ${method} | Patch: ${page.url} | Param: ${param} | Payload: ${item.payload}`);
            const testUrl = new URL(page.url);
            let fetchOptions = {
              method,
              headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
              signal: AbortSignal.timeout(2500)
            };

            if (["GET", "DELETE", "HEAD", "PATCH"].includes(method)) {
              testUrl.searchParams.set(param, item.payload);
            } else {
              fetchOptions.body = new URLSearchParams({ [param]: item.payload }).toString();
            }

            const res = await globalThis.fetch(testUrl.toString(), fetchOptions).catch(() => null);
            if (res && res.status) {
              if ([401, 403, 404, 429].includes(res.status)) continue;
              const body = method === "HEAD" ? "" : await res.text().catch(() => "");
              if (res.status === 500 || body.toLowerCase().includes(item.indicator.toLowerCase()) || body.toLowerCase().includes("syntax error") || body.toLowerCase().includes("sql")) {
                const finding = {
                  title: `Active SQL Injection (${method}) Confirmed`,
                  severity: "Critical",
                  cwe: "CWE-89",
                  evidence: [`HTTP Method: ${method}`, `Patch: ${page.url}`, `Parameter: ${param}`, `Payload: ${item.payload}`, `Status: ${res.status}`],
                  location: testUrl.toString(),
                  check: `Active Fuzzer - SQLi (${method})`,
                  summary: `Payload SQLi [ ${item.payload} ] berhasil memicu error server / indikator menggunakan metode ${method} pada patch ${page.url} (Parameter '${param}').`,
                  poc: `curl -X ${method} "${testUrl.toString()}"`,
                  remediation: "Gunakan Prepared Statements / Parameterized Queries untuk mencegah manipulasi query SQL oleh input pengguna."
                };
                findings.push(finding);
                onFinding(finding);
              }
            }
          } catch {}
        }

        // --- XSS Payloads ---
        for (const item of xssPayloads) {
          try {
            log(`[PAYLOAD: XSS] Method: ${method} | Patch: ${page.url} | Param: ${param} | Payload: ${item.payload}`);
            const testUrl = new URL(page.url);
            let fetchOptions = {
              method,
              headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
              signal: AbortSignal.timeout(2500)
            };

            if (["GET", "DELETE", "HEAD", "PATCH"].includes(method)) {
              testUrl.searchParams.set(param, item.payload);
            } else {
              fetchOptions.body = new URLSearchParams({ [param]: item.payload }).toString();
            }

            const res = await globalThis.fetch(testUrl.toString(), fetchOptions).catch(() => null);
            if (res && res.ok) {
              const body = method === "HEAD" ? "" : await res.text().catch(() => "");
              if (body.includes(item.indicator)) {
                const finding = {
                  title: `Active Reflected XSS (${method}) Confirmed`,
                  severity: "High",
                  cwe: "CWE-79",
                  evidence: [`HTTP Method: ${method}`, `Patch: ${page.url}`, `Parameter: ${param}`, `Payload: ${item.payload}`],
                  location: testUrl.toString(),
                  check: `Active Fuzzer - XSS (${method})`,
                  summary: `Payload XSS [ ${item.payload} ] terpantul secara mentah menggunakan metode ${method} pada patch ${page.url} (Parameter '${param}').`,
                  poc: `curl -X ${method} "${testUrl.toString()}"`,
                  remediation: "Terapkan HTML entity encoding dan sanitasi input sebelum merefleksikan data pengguna ke halaman web."
                };
                findings.push(finding);
                onFinding(finding);
              }
            }
          } catch {}
        }

      }
    }

    // 3. Test Discovered Forms across ALL HTTP Methods
    if (Array.isArray(page.forms)) {
      for (const form of page.forms) {
        for (const inputName of form.inputNames) {
          for (const method of ["GET", "POST", "PUT", "PATCH"]) {
            const actionUrl = form.actionUrl || page.url;

            for (const item of sqliPayloads) {
              try {
                log(`[FORM-FUZZ: SQLi] Method: ${method} | Form: ${actionUrl} | Field: ${inputName} | Payload: ${item.payload}`);
                const testUrl = new URL(actionUrl);
                let fetchOptions = {
                  method,
                  headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
                  signal: AbortSignal.timeout(2500)
                };

                if (["GET", "DELETE", "HEAD", "PATCH"].includes(method)) {
                  testUrl.searchParams.set(inputName, item.payload);
                } else {
                  fetchOptions.body = new URLSearchParams({ [inputName]: item.payload }).toString();
                }

                const res = await globalThis.fetch(testUrl.toString(), fetchOptions).catch(() => null);
                if (res && res.status) {
                  if ([401, 403, 404, 429].includes(res.status)) continue;
                  const body = method === "HEAD" ? "" : await res.text().catch(() => "");
                  if (res.status === 500 || body.toLowerCase().includes(item.indicator.toLowerCase()) || body.toLowerCase().includes("syntax error") || body.toLowerCase().includes("sql")) {
                    const finding = {
                      title: `Active Form SQL Injection (${method}) Confirmed`,
                      severity: "Critical",
                      cwe: "CWE-89",
                      evidence: [`HTTP Method: ${method}`, `Form Action: ${actionUrl}`, `Input Field: ${inputName}`, `Payload: ${item.payload}`],
                      location: testUrl.toString(),
                      check: `Active Fuzzer - Form SQLi (${method})`,
                      summary: `Kolom input/laporan/search '${inputName}' rentan terhadap SQL Injection menggunakan metode ${method} pada aksi form ${actionUrl}.`,
                      poc: `curl -X ${method} -d "${inputName}=${encodeURIComponent(item.payload)}" "${actionUrl}"`,
                      remediation: "Gunakan Prepared Statements / Parameterized Queries pada penanganan form input."
                    };
                    findings.push(finding);
                    onFinding(finding);
                  }
                }
              } catch {}
            }

            for (const item of xssPayloads) {
              try {
                log(`[FORM-FUZZ: XSS] Method: ${method} | Form: ${actionUrl} | Field: ${inputName} | Payload: ${item.payload}`);
                const testUrl = new URL(actionUrl);
                let fetchOptions = {
                  method,
                  headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
                  signal: AbortSignal.timeout(2500)
                };

                if (["GET", "DELETE", "HEAD", "PATCH"].includes(method)) {
                  testUrl.searchParams.set(inputName, item.payload);
                } else {
                  fetchOptions.body = new URLSearchParams({ [inputName]: item.payload }).toString();
                }

                const res = await globalThis.fetch(testUrl.toString(), fetchOptions).catch(() => null);
                if (res && res.ok) {
                  const body = method === "HEAD" ? "" : await res.text().catch(() => "");
                  if (body.includes(item.indicator)) {
                    const finding = {
                      title: `Active Form Reflected XSS (${method}) Confirmed`,
                      severity: "High",
                      cwe: "CWE-79",
                      evidence: [`HTTP Method: ${method}`, `Form Action: ${actionUrl}`, `Input Field: ${inputName}`, `Payload: ${item.payload}`],
                      location: testUrl.toString(),
                      check: `Active Fuzzer - Form XSS (${method})`,
                      summary: `Kolom input/laporan/search '${inputName}' rentan terhadap Reflected XSS menggunakan metode ${method} pada aksi form ${actionUrl}.`,
                      poc: `curl -X ${method} -d "${inputName}=${encodeURIComponent(item.payload)}" "${actionUrl}"`,
                      remediation: "Terapkan HTML entity encoding dan sanitasi input pada semua parameter form submission."
                    };
                    findings.push(finding);
                    onFinding(finding);
                  }
                }
              } catch {}
            }

          }
        }
      }
    }

  }

  log(`[FUZZER] Active fuzzing selesai.`);
  return findings;
}

module.exports = { runActiveFuzzer };
