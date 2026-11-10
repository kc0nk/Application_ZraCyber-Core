const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkReddit(username) {
  if (!username) return null;
  try {
    const res = await fetch(`https://www.reddit.com/user/${username}/about.json`, {
      headers: { "User-Agent": "ZraCore-OSINT-Agent/3.0" },
      signal: AbortSignal.timeout(4000)
    });
    if (res.status === 200) {
      const data = await res.json();
      const info = data?.data;
      if (info) {
        return {
          platform: "Reddit",
          url: `https://www.reddit.com/user/${username}`,
          status: "found",
          evidence: {
            displayName: info.subreddit?.title || username,
            bio: info.subreddit?.public_description || "",
            avatar: info.icon_img || "",
            publicLinks: []
          }
        };
      }
    }
  } catch {}
  return null;
}

module.exports = { checkReddit };
