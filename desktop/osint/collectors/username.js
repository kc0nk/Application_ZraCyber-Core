const { checkPlatformMatrix } = require("../sources/platform-matrix.cjs");

async function collectUsername(username) {
  if (!username) return [];
  const results = await checkPlatformMatrix(username);
  return results;
}

module.exports = { collectUsername };
