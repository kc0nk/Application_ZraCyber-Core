async function collectName(name, aliases) {
  if (!name) return [];
  const query = encodeURIComponent(`"${name}"`);
  return [
    { platform: "Google Exact Search", url: `https://www.google.com/search?q=${query}`, status: "found", evidence: { displayName: name, bio: "Google public search index", avatar: "", publicLinks: [] } },
    { platform: "LinkedIn Directory", url: `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(name)}`, status: "found", evidence: { displayName: name, bio: "LinkedIn professional directory search", avatar: "", publicLinks: [] } },
    { platform: "Scribd Document Index", url: `https://www.scribd.com/search?query=${encodeURIComponent(name)}`, status: "found", evidence: { displayName: name, bio: "Scribd publication & document index", avatar: "", publicLinks: [] } }
  ];
}

module.exports = { collectName };
