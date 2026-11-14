const { extractFormsAndResources } = require("./url-discovery.cjs");
const { extractJsEndpoints } = require("./js-analyzer.cjs");

async function crawlWebsite(startUrl, origin, maxPages = 50, cookieHeader = "", onPage = () => {}) {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];
  const nodes = [];
  const edges = [];

  try {
    const sitemapRes = await globalThis.fetch(`${origin}/sitemap.xml`, {
      method: "GET",
      headers: { "User-Agent": "ZraCore-Passive-WebScanner/3.0" },
      signal: AbortSignal.timeout(3000)
    }).catch(() => null);

    if (sitemapRes && sitemapRes.ok) {
      const sitemapXml = await sitemapRes.text().catch(() => "");
      const locPattern = /<loc>(.*?)<\/loc>/gi;
      for (const match of sitemapXml.matchAll(locPattern)) {
        try {
          const locUrl = new URL(match[1].trim());
          if (locUrl.origin === origin && !queue.includes(locUrl.toString())) {
            queue.push(locUrl.toString());
          }
        } catch {}
      }
    }
  } catch {}

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      if (new URL(current).origin !== origin) continue;
    } catch {
      continue;
    }

    try {
      const res = await globalThis.fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "ZraCore-Passive-WebScanner/3.0",
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        },
        signal: AbortSignal.timeout(4000)
      }).catch(() => null);

      if (res && res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) {
          try {
            const nextUrl = new URL(location, current).toString();
            if (new URL(nextUrl).origin === origin && !visited.has(nextUrl) && queue.length < 200) {
              queue.push(nextUrl);
            }
          } catch {}
        }
      } else if (res && res.ok) {
        const text = await res.text().catch(() => "");
        const headersObj = {};
        res.headers.forEach((val, key) => { headersObj[key] = val; });

        const isJs = current.endsWith(".js") || headersObj["content-type"]?.includes("javascript");

        if (isJs) {
          pages.push({ url: current, status: res.status, headers: headersObj, body: text, reachable: true, forms: [] });
          const jsEndpoints = extractJsEndpoints(text, current, origin);
          for (const ep of jsEndpoints) {
            if (!visited.has(ep) && queue.length < 200) {
              queue.push(ep);
            }
          }
        } else {
          const { links, forms } = extractFormsAndResources(text, current, origin);
          pages.push({ url: current, status: res.status, headers: headersObj, body: text, reachable: true, forms });
          onPage({ url: current, status: res.status, title: current, links: links.length, forms: forms.length });

          const nodeId = `node-${visited.size}`;
          nodes.push({ id: nodeId, url: current, type: current === startUrl ? "root" : "endpoint" });

          // Extract endpoints from inline <script> tags inside HTML
          const scriptTagRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
          for (const scriptMatch of text.matchAll(scriptTagRegex)) {
            const scriptContent = scriptMatch[1];
            const inlineEndpoints = extractJsEndpoints(scriptContent, current, origin);
            for (const ep of inlineEndpoints) {
              if (!visited.has(ep) && queue.length < 200) {
                queue.push(ep);
              }
            }
          }

          for (const link of links) {
            if (!visited.has(link) && queue.length < 200) {
              try {
                if (new URL(link).origin === origin) {
                  queue.push(link);
                  edges.push({ from: nodeId, to: link, relation: "links_to" });
                  if (link.endsWith(".js")) {
                    queue.push(link);
                  }
                }
              } catch {}
            }
          }
        }
      } else if (res) {
        const text = await res.text().catch(() => "");
        const headersObj = {};
        res.headers.forEach((val, key) => { headersObj[key] = val; });
        pages.push({ url: current, status: res.status, headers: headersObj, body: text, reachable: true, forms: [] });
        onPage({ url: current, status: res.status, title: current, links: 0, forms: 0 });
      } else {
        pages.push({ url: current, status: "unreachable", headers: {}, body: "", reachable: false, forms: [] });
        onPage({ url: current, status: "unreachable", title: current, links: 0, forms: 0 });
      }
    } catch {
      pages.push({ url: current, status: "unreachable", headers: {}, body: "", reachable: false, forms: [] });
      onPage({ url: current, status: "unreachable", title: current, links: 0, forms: 0 });
    }
  }

  return { nodes, edges, pages };
}

module.exports = { crawlWebsite };
