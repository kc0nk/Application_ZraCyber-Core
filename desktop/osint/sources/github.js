const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkGithub(username) {
  if (!username) return null;
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: { "User-Agent": "ZraCore-OSINT-Agent/3.0" },
      signal: AbortSignal.timeout(4000)
    });
    if (res.status === 200) {
      const data = await res.json();
      return {
        platform: "GitHub",
        url: data.html_url,
        status: "found",
        evidence: {
          displayName: data.name || data.login,
          bio: data.bio || "",
          avatar: data.avatar_url,
          publicLinks: [data.blog].filter(Boolean)
        }
      };
    }
  } catch {}
  return null;
}

module.exports = { checkGithub };
