const { checkWebProfile } = require("../sources/web");

async function collectWebsite(domain) {
  if (!domain) return [];
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const res = await checkWebProfile(url);
  return res ? [res] : [];
}

module.exports = { collectWebsite };
