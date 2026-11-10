async function collectEmail(email) {
  if (!email) return [];
  const domain = email.split("@")[1] || "";
  const username = email.split("@")[0] || "";
  return [
    { platform: "Email Domain", url: `mailto:${email}`, status: "found", evidence: { displayName: email, bio: `Domain: ${domain}`, avatar: "", publicLinks: [domain] } },
    { platform: "Gravatar", url: `https://en.gravatar.com/${username}.json`, status: "checked", evidence: { displayName: username, bio: "Gravatar profile reference", avatar: "", publicLinks: [] } }
  ];
}

module.exports = { collectEmail };
