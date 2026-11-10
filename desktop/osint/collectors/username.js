const { checkGithub } = require("../sources/github");
const { checkReddit } = require("../sources/reddit");
const { checkGitlab } = require("../sources/gitlab");

async function collectUsername(username) {
  if (!username) return [];
  const results = await Promise.all([
    checkGithub(username),
    checkReddit(username),
    checkGitlab(username)
  ]);
  return results.filter(Boolean);
}

module.exports = { collectUsername };
