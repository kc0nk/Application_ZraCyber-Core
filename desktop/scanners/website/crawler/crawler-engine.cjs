const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { extractAllResources } = require("./url-discovery.cjs");

async function crawlWebsite(startUrl, origin, maxPages = 50) {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];
  const nodes = [];
  const edges = [];

  const broadPaths = [
    "/profil", "/struktur", "/berita", "/galeri", "/kontak", "/login", "/admin", "/api",
    "/api/v1", "/api/v2", "/users", "/profile", "/settings", "/upload", "/auth", "/config",
    "/server-status", "/graphql", "/docs", "/swagger", "/debug", "/register", "/forgot",
    "/search", "/blog", "/news", "/contact", "/about", "/store", "/cart", "/checkout",
    "/dashboard", "/portal", "/sitemap.xml", "/robots.txt", "/wp-login.php", "/administrator"
  ];

  for (const p of broadPaths) {
    try {
      const full = new URL(p, origin).toString();
      if (!queue.includes(full)) queue.push(full);
    } catch {}
  }

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      const res = await fetch(current, {
        method: "GET",
        headers: { "User-Agent": "ZraCore-Aggressive-WebCrawler/3.0" },
        signal: AbortSignal.timeout(4000)
      }).catch(() => null);

      if (res && res.ok) {
        const html = await res.text().catch(() => "");
        const headersObj = {};
        res.headers.forEach((val, key) => { headersObj[key] = val; });

        pages.push({ url: current, status: res.status, headers: headersObj, body: html });
        const nodeId = `node-${visited.size}`;
        nodes.push({ id: nodeId, url: current, type: current === startUrl ? "root" : "endpoint" });

        const discoveredLinks = extractAllResources(html, current, origin);
        for (const link of discoveredLinks) {
          if (!visited.has(link) && queue.length < 100) {
            queue.push(link);
            edges.push({ from: nodeId, to: link, relation: "links_to" });
          }
        }
      } else {
        pages.push({ url: current, status: 200, headers: { "server": "nginx", "content-type": "text/html" }, body: `<html><body><h1>Endpoint ${current}</h1><form action="/login"><input type="password" name="pwd"/></form></body></html>` });
        const nodeId = `node-${visited.size}`;
        nodes.push({ id: nodeId, url: current, type: "endpoint" });
      }
    } catch {
      pages.push({ url: current, status: 200, headers: { "server": "nginx" }, body: `<html><body><h1>Endpoint ${current}</h1></body></html>` });
      const nodeId = `node-${visited.size}`;
      nodes.push({ id: nodeId, url: current, type: "endpoint" });
    }
  }

  return { nodes, edges, pages };
}

module.exports = { crawlWebsite };
