const { resolve4 } = require("node:dns/promises");

async function analyzeDnsRecon(hostname) {
  try {
    const ips = await resolve4(hostname).catch(() => []);
    return { ips, resolved: ips.length > 0, cdn: hostname.includes("cloudflare") ? "Cloudflare" : "Direct / Generic" };
  } catch {
    return { resolved: false, ips: [], cdn: "Unknown" };
  }
}

module.exports = { analyzeDnsRecon };
