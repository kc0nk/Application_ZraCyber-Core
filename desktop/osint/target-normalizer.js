function normalizeTarget(input) {
  const username = input.username ? input.username.trim().replace(/^@/, "") : "";
  const email = input.email ? input.email.trim().toLowerCase() : "";
  const name = input.name ? input.name.trim() : "";
  const domain = input.domain ? input.domain.trim().toLowerCase() : "";
  const aliases = Array.isArray(input.aliases) ? input.aliases.map(a => a.trim()).filter(Boolean) : (name ? name.toLowerCase().split(/\s+/) : []);

  return {
    username,
    email,
    name,
    domain,
    aliases,
    rawQuery: username || email || name || domain || "unknown"
  };
}

module.exports = { normalizeTarget };
