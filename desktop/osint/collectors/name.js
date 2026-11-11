const { checkGithub } = require("../sources/github");

async function collectName(name, aliases) {
  if (!name) return [];
  const encodedName = encodeURIComponent(name);
  const exactQuery = encodeURIComponent(`"${name}"`);

  let githubMatch = null;
  try {
    githubMatch = await checkGithub(name);
  } catch {}

  const results = [
    githubMatch,
    { platform: "Google Exact Search", url: `https://www.google.com/search?q=${exactQuery}`, status: "found", evidence: { displayName: name, bio: "Google public search exact match index", avatar: "", publicLinks: [] } },
    { platform: "LinkedIn Directory", url: `https://www.linkedin.com/pub/dir?firstName=${encodedName}`, status: "found", evidence: { displayName: name, bio: "LinkedIn professional directory search", avatar: "", publicLinks: [] } },
    { platform: "Facebook Public Directory", url: `https://www.facebook.com/public?query=${encodedName}`, status: "found", evidence: { displayName: name, bio: "Facebook public profile directory search", avatar: "", publicLinks: [] } },
    { platform: "Scribd Document Index", url: `https://www.scribd.com/search?query=${encodedName}`, status: "found", evidence: { displayName: name, bio: "Scribd document & academic publication search", avatar: "", publicLinks: [] } },
    { platform: "Pinterest Name Index", url: `https://id.pinterest.com/search/pins/?q=${encodedName}`, status: "found", evidence: { displayName: name, bio: "Pinterest visual pin & name index", avatar: "", publicLinks: [] } }
  ];

  return results.filter(Boolean);
}

module.exports = { collectName };
