function normalizeTarget(input) {
  const raw = (input.target || input.username || input.email || input.name || input.domain || "").trim();
  const explicitType = input.searchType;

  let isUsername = false;
  let isEmail = false;
  let isName = false;

  if (explicitType === "username") {
    isUsername = true;
  } else if (explicitType === "email") {
    isEmail = true;
  } else if (explicitType === "name") {
    isName = true;
  } else {
    isUsername = raw.startsWith("@") || (!raw.includes(" ") && !raw.includes("@"));
    isEmail = raw.includes("@") && raw.includes(".");
    isName = !isUsername && !isEmail;
  }

  let username = isUsername ? raw.replace(/^@/, "") : "";
  let email = isEmail ? raw : "";
  let name = isName ? raw : "";
  let domain = raw.includes(".") && !isEmail && !raw.includes(" ") ? raw : "";

  return {
    username,
    email,
    name,
    domain,
    searchType: explicitType || (isUsername ? "username" : isEmail ? "email" : "name"),
    aliases: name ? name.toLowerCase().split(/\s+/) : [],
    rawQuery: raw
  };
}

module.exports = { normalizeTarget };
