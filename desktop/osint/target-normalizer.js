function normalizeTarget(input) {
  const raw = (input.target || input.username || input.email || input.name || input.domain || "").trim();
  const isUsername = raw.startsWith("@") || (!raw.includes(" ") && !raw.includes("@"));
  const isEmail = raw.includes("@") && raw.includes(".");

  let username = isUsername ? raw.replace(/^@/, "") : "";
  let email = isEmail ? raw : "";
  let name = !isUsername && !isEmail ? raw : "";
  let domain = raw.includes(".") && !isEmail && !raw.includes(" ") ? raw : "";

  return {
    username,
    email,
    name,
    domain,
    aliases: name ? name.toLowerCase().split(/\s+/) : [],
    rawQuery: raw
  };
}

module.exports = { normalizeTarget };
