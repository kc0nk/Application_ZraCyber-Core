const sqliPayloads = require("../payloads/sqli-payloads.cjs");
const xssPayloads = require("../payloads/xss-payloads.cjs");
const lfiPayloads = require("../payloads/lfi-payloads.cjs");

async function runActiveFuzzer(pages, origin) {
  const findings = [];
  const commonParams = ["id", "q", "search", "page", "cat", "s", "query", "view", "item", "user", "action"];

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

    // 1. Test OPTIONS method on endpoint for allowed methods disclosure
    try {
      const optRes = await globalThis.fetch(page.url, {
        method: "OPTIONS",
        headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0" },
        signal: AbortSignal.timeout(3000)
      }).catch(() => null);

      if (optRes) {
        const allowHeader = optRes.headers.get("allow") || optRes.headers.get("access-control-allow-methods") || "";
        if (allowHeader && (allowHeader.includes("PUT") || allowHeader.includes("DELETE") || allowHeader.includes("TRACE"))) {
          findings.push({
            title: "Potentially Risky HTTP Methods Enabled (OPTIONS)",
            severity: "Low",
            cwe: "CWE-749",
            evidence: [`Allowed Methods Header: ${allowHeader}`],
            location: page.url,
            check: "Active Fuzzer - HTTP OPTIONS Method Analysis",
            summary: `Server mengonfirmasi dukungan metode HTTP berisiko melalui header Allow: ${allowHeader}. Tinjau apakah metode ini diperlukan.`
          });
        }
      }
    } catch {}

    for (const param of params.slice(0, 3)) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        for (const item of sqliPayloads.slice(0, 2)) {
          try {
            const testUrl = new URL(page.url);
            let fetchOptions = {
              method,
              headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
              signal: AbortSignal.timeout(3000)
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
                findings.push({
                  title: `Active SQL Injection (${method}) Vulnerability Confirmed`,
                  severity: "Critical",
                  cwe: "CWE-89",
                  evidence: [`HTTP Method: ${method}`, `Parameter: ${param}`, `Payload: ${item.payload}`, `Response Status: ${res.status}`],
                  location: testUrl.toString(),
                  check: `Active Fuzzer - SQLi (${method})`,
                  summary: `Pengujian aktif menggunakan metode ${method} dengan payload [ ${item.payload} ] pada parameter '${param}' berhasil memicu error server (HTTP ${res.status}).`
                });
                break;
              }
            }
          } catch {}
        }

        if (["GET", "POST"].includes(method)) {
          for (const item of xssPayloads.slice(0, 2)) {
            try {
              const testUrl = new URL(page.url);
              let fetchOptions = {
                method,
                headers: { "User-Agent": "ZraCore-Active-Fuzzer/3.0", "Content-Type": "application/x-www-form-urlencoded" },
                signal: AbortSignal.timeout(3000)
              };

              if (method === "GET") {
                testUrl.searchParams.set(param, item.payload);
              } else {
                fetchOptions.body = new URLSearchParams({ [param]: item.payload }).toString();
              }

              const res = await globalThis.fetch(testUrl.toString(), fetchOptions).catch(() => null);

              if (res && res.ok) {
                const body = await res.text().catch(() => "");
                if (body.includes(item.indicator)) {
                  findings.push({
                    title: `Active Reflected XSS (${method}) Confirmed`,
                    severity: "High",
                    cwe: "CWE-79",
                    evidence: [`HTTP Method: ${method}`, `Parameter: ${param}`, `Payload: ${item.payload}`, `Reflected Marker: ${item.indicator}`],
                    location: testUrl.toString(),
                    check: `Active Fuzzer - XSS (${method})`,
                    summary: `Pengujian aktif menggunakan metode ${method} mengonfirmasi bahwa payload XSS [ ${item.payload} ] terpantul secara mentah pada parameter '${param}'.`
                  });
                  break;
                }
              }
            } catch {}
          }
        }
      }
    }
  }

  return findings;
}

module.exports = { runActiveFuzzer };
