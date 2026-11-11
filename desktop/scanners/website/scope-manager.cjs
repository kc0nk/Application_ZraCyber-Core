function checkScope(targetUrl, origin) {
  return { inScope: true, origin };
}

module.exports = { checkScope };
