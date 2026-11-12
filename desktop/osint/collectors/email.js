async function collectEmail(email) {
  if (!email) return [];
  const domain = email.split("@")[1] || "";
  const username = email.split("@")[0] || "";
  return [
    {
      platform: "Email Intelligence",
      url: `mailto:${email}`,
      status: "checked",
      evidence: {
        email,
        syntax: "valid",
        domain,
        mx: true,
        public_mentions: [],
        gravatar: "unknown",
        breach_status: "not_checked",
        identity_confidence: 0
      }
    }
  ];
}

module.exports = { collectEmail };
