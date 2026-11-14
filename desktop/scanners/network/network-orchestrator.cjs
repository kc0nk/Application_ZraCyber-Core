// Passive network inventory for domains with verified DNS TXT ownership.
const { resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } = require("node:dns/promises");
const { domainToASCII } = require("node:url");

function normalizeDomain(input) {
  const raw = String(input || "").trim();
  let host;
  try { host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname; }
  catch { throw new Error("Masukkan URL atau domain yang valid."); }
  const domain = domainToASCII(host.toLowerCase().replace(/\\.$/, ""));
  if (!domain || domain.length > 253 || !domain.includes(".") || domain.split(".").some(x => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) {
    throw new Error("Domain tidak valid. IP address dan hostname lokal tidak didukung.");
  }
  return domain;
}
async function safeResolve(fn, name) {
  try { return await fn(name); } catch (error) {
    if (["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT"].includes(error.code)) return [];
    throw error;
  }
}
async function discoverNetwork(domain) {
  const startedAt = new Date().toISOString();
  const [a, aaaa, cname, mx, ns, txt] = await Promise.all([
    safeResolve(resolve4, domain), safeResolve(resolve6, domain), safeResolve(resolveCname, domain),
    safeResolve(resolveMx, domain), safeResolve(resolveNs, domain), safeResolve(resolveTxt, domain),
  ]);
  let subdomains = [];
  let certificateSource = "crt.sh Certificate Transparency";
  try {
    const response = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
    if (response.ok) {
      const rows = await response.json();
      const seen = new Set();
      for (const row of Array.isArray(rows) ? rows.slice(0, 5000) : []) {
        for (const candidate of String(row.name_value || "").split(/[\\r\\n,]/)) {
          const name = candidate.trim().toLowerCase().replace(/^\\*\\./, "");
          if (name === domain || name.endsWith(`.${domain}`) && name.length <= 253 && !name.includes("*")) seen.add(name);
        }
      }
      subdomains = [...seen].sort().slice(0, 500);
    }
  } catch { certificateSource = "Tidak tersedia (timeout atau sumber tidak dapat dijangkau)"; }
  const hosts = [...new Set([domain, ...subdomains])].slice(0, 501);
  const resolvedHosts = await Promise.all(hosts.map(async host => {
    if (host === domain) return { hostname: host, ipv4: a, ipv6: aaaa, source: "DNS A/AAAA" };
    const [v4, v6] = await Promise.all([safeResolve(resolve4, host), safeResolve(resolve6, host)]);
    return { hostname: host, ipv4: v4, ipv6: v6, source: "Certificate Transparency + DNS" };
  }));
  const ipAddresses = [...new Set(resolvedHosts.flatMap(h => [...h.ipv4, ...h.ipv6]))].sort();
  return {
    success: true, target: domain, generatedAt: startedAt,
    summary: { subdomains: subdomains.length, uniqueIps: ipAddresses.length, ipv4: ipAddresses.filter(x => x.includes(".")).length, ipv6: ipAddresses.filter(x => x.includes(":")).length },
    dns: { A: a, AAAA: aaaa, CNAME: cname, MX: mx, NS: ns, TXT: txt.map(parts => parts.join("")) },
    subdomains: resolvedHosts.filter(h => h.hostname !== domain),
    hosts: resolvedHosts, ipAddresses,
    sources: { subdomains: certificateSource, dns: "Node.js DNS resolver" },
    limitations: "Pemetaan pasif. Certificate Transparency bukan inventaris lengkap; record DNS dapat berubah dan hasil tidak membuktikan kepemilikan aset di luar domain terverifikasi. Tidak ada port scan, brute force, eksploitasi, atau koneksi HTTP ke host hasil.",
  };
}
module.exports = { normalizeDomain, discoverNetwork };
