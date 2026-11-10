function collectProfile(profiles) {
  return profiles.map(p => ({
    username: p.evidence?.displayName || "unknown",
    displayName: p.evidence?.displayName || "",
    bio: p.evidence?.bio || "",
    avatar: p.evidence?.avatar || "",
    website: p.evidence?.publicLinks?.[0] || "",
    platform: p.platform,
    url: p.url
  }));
}

module.exports = { collectProfile };
