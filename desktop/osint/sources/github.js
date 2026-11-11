const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkGithub(query) {
  if (!query) return null;
  const isUsername = !query.includes(" ");
  try {
    if (isUsername) {
      const res = await fetch(`https://api.github.com/users/${query}`, {
        headers: { "User-Agent": "ZraCore-OSINT-Agent/3.0" },
        signal: AbortSignal.timeout(4000)
      });
      if (res.status === 200) {
        const data = await res.json();
        return {
          platform: "GitHub User",
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
    } else {
      const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "ZraCore-OSINT-Agent/3.0" },
        signal: AbortSignal.timeout(5000)
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const topUser = data.items[0];
          return {
            platform: "GitHub Match (Full Name)",
            url: topUser.html_url,
            status: "found",
            evidence: {
              displayName: topUser.login,
              bio: `GitHub Account match for query: ${query}`,
              avatar: topUser.avatar_url,
              publicLinks: [topUser.html_url]
            }
          };
        }
      }
    }
  } catch {}
  return null;
}

module.exports = { checkGithub };
