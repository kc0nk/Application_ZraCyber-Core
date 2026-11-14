function extractJsEndpoints(jsContent, baseUrl, origin) {
  const endpoints = new Set();
  const routePattern = /(?:["'`])(\/[a-zA-Z0-9_\-\/\.\?=&%]+)(?:["'`])/g;
  for (const match of jsContent.matchAll(routePattern)) {
    const route = match[1];
    if (route.length > 1 && !route.endsWith(".css") && !route.endsWith(".png") && !route.endsWith(".jpg") && !route.endsWith(".svg") && !route.endsWith(".ico") && !route.endsWith(".woff")) {
      try {
        const fullUrl = new URL(route, baseUrl).toString();
        const parsed = new URL(fullUrl);
        if (parsed.origin === origin) {
          endpoints.add(fullUrl);
        }
      } catch {}
    }
  }
  return Array.from(endpoints);
}

module.exports = { extractJsEndpoints };
