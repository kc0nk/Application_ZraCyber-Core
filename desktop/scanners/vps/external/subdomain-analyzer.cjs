async function analyzeSubdomains(domain) {
  return [`www.${domain}`, `api.${domain}`, `admin.${domain}`, `mail.${domain}`];
}
module.exports = { analyzeSubdomains };
