const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkGitlab(username) {
  if (!username) return null;
  try {
    const res = await fetch(`https://gitlab.com/api/v4/users?username=${username}`, {
      headers: { "User-Agent": "ZraCore-OSINT-Agent/3.0" },
      signal: AbortSignal.timeout(4000)
    });
    if (res.status === 200) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const user = data[0];
        return {
          platform: "GitLab",
          url: user.web_url,
          status: "found",
          evidence: {
            displayName: user.name || user.username,
            bio: user.bio || "",
            avatar: user.avatar_url || "",
            publicLinks: [user.website_url].filter(Boolean)
          }
        };
      }
    }
  } catch {}
  return null;
}

module.exports = { checkGitlab };
