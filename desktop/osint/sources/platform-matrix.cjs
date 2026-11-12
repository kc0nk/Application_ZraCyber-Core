const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const PLATFORMS = [
  { name: "GitHub", urlTpl: (u) => `https://github.com/${u}`, api: (u) => `https://api.github.com/users/${u}` },
  { name: "Reddit", urlTpl: (u) => `https://www.reddit.com/user/${u}`, api: (u) => `https://www.reddit.com/user/${u}/about.json` },
  { name: "GitLab", urlTpl: (u) => `https://gitlab.com/${u}`, api: (u) => `https://gitlab.com/api/v4/users?username=${u}` },
  { name: "Hugging Face", urlTpl: (u) => `https://huggingface.co/${u}`, api: (u) => `https://huggingface.co/api/users/${u}/profile` },
  { name: "Dev.to", urlTpl: (u) => `https://dev.to/${u}`, api: null },
  { name: "Medium", urlTpl: (u) => `https://medium.com/@${u}`, api: null },
  { name: "Twitter / X", urlTpl: (u) => `https://x.com/${u}`, api: null },
  { name: "Instagram", urlTpl: (u) => `https://www.instagram.com/${u}/`, api: null },
  { name: "Pinterest", urlTpl: (u) => `https://id.pinterest.com/${u}/`, api: null },
  { name: "SoundCloud", urlTpl: (u) => `https://soundcloud.com/${u}`, api: null }
];

async function checkPlatformMatrix(username) {
  if (!username) return [];
  const results = [];
  for (const p of PLATFORMS) {
    const profileUrl = p.urlTpl(username);
    let status = "UNVERIFIED";
    let evidenceDetail = "Direktori publik tercatat";

    try {
      if (p.api) {
        const res = await fetch(p.api(username), {
          headers: { "User-Agent": "ZraCore-OSINT-Matrix/3.0" },
          signal: AbortSignal.timeout(3000)
        }).catch(() => null);

        if (res) {
          if (res.status === 200) {
            status = "FOUND";
            evidenceDetail = `Verified API presence on ${p.name}`;
          } else if (res.status === 404) {
            status = "NOT_FOUND";
          } else if (res.status === 429) {
            status = "RATE_LIMITED";
          }
        }
      } else {
        const res = await fetch(profileUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZraCore-OSINT/3.0" },
          signal: AbortSignal.timeout(3000)
        }).catch(() => null);

        if (res) {
          if (res.status === 200) {
            status = "FOUND";
            evidenceDetail = `HTTP 200 OK profile existence on ${p.name}`;
          } else if (res.status === 404) {
            status = "NOT_FOUND";
          } else if (res.status === 403 || res.status === 429) {
            status = "BLOCKED";
          }
        }
      }
    } catch {
      status = "UNKNOWN";
    }

    results.push({
      platform: p.name,
      url: profileUrl,
      status,
      evidence: {
        displayName: username,
        bio: evidenceDetail,
        avatar: "",
        publicLinks: [profileUrl]
      }
    });
  }
  return results;
}

module.exports = { checkPlatformMatrix };
