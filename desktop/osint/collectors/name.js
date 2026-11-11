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
    { platform: "Google Exact Search", url: `https://www.google.com/search?q=${exactQuery}`, status: "unverified_search_index", evidence: { displayName: name, bio: "Buka pencarian exact match Google", avatar: "", publicLinks: [] } },
    { platform: "LinkedIn Directory", url: `https://www.linkedin.com/pub/dir?firstName=${encodedName}`, status: "unverified_search_index", evidence: { displayName: name, bio: "Buka direktori profesional LinkedIn", avatar: "", publicLinks: [] } },
    { platform: "Facebook Public Directory", url: `https://www.facebook.com/public?query=${encodedName}`, status: "unverified_search_index", evidence: { displayName: name, bio: "Buka direktori profil publik Facebook", avatar: "", publicLinks: [] } },
    { platform: "Scribd Document Index", url: `https://www.scribd.com/search?query=${encodedName}`, status: "unverified_search_index", evidence: { displayName: name, bio: "Buka indeks dokumen publik Scribd", avatar: "", publicLinks: [] } }
  ];

  return results.filter(Boolean);
}

module.exports = { collectName };
