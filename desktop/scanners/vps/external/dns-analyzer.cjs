const { resolve4, resolveMx } = require("node:dns/promises");

async function analyzeDns(domain) {
  try {
    const a = await resolve4(domain).catch(() => []);
    const mx = await resolveMx(domain).catch(() => []);
    return { aRecords: a, mxRecords: mx, resolved: a.length > 0 };
  } catch {
    return { resolved: false, aRecords: [], mxRecords: [] };
  }
}

module.exports = { analyzeDns };
