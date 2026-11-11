function extractJsEndpoints(jsContent, origin) {
  const endpoints = new Set();
  const routePattern = /(?:["'])(?:\/api\/|\/v1\/|\/v2\/|\/users|\/admin|\/auth|\/graphql|\/upload)[a-zA-Z0-9_\-\/]+(?:["'])/g;
  for (const match of jsContent.matchAll(routePattern)) {
    const route = match[0].replace(/['"]/g, "");
    try {
      const fullUrl = new URL(route, origin).toString();
      endpoints.add(fullUrl);
    } catch {}
  }
  return Array.from(endpoints);
}

module.exports = { extractJsEndpoints };
