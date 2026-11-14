function normalizeTarget(input) {
  const raw = (input.target || input.username || input.name || input.domain || "").trim();
  const explicitType = input.searchType;

  let isUsername = false;
  let isName = false;

  if (explicitType === "username") {
    isUsername = true;
  } else if (explicitType === "name") {
    isName = true;
  } else {
    isUsername = raw.startsWith("@") || (!raw.includes(" ") && !raw.includes("@"));
    isName = !isUsername;
  }

  let username = isUsername ? raw.replace(/^@/, "") : "";
  let name = isName ? raw : "";
  let domain = raw.includes(".") && !raw.includes(" ") ? raw : "";

  return {
    username,
    name,
    domain,
    searchType: explicitType || (isUsername ? "username" : "name"),
    aliases: name ? name.toLowerCase().split(/\s+/) : [],
    rawQuery: raw
  };
}

module.exports = { normalizeTarget };
