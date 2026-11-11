const { extractAllResources } = require("./url-discovery.cjs");

async function crawlWebsite(startUrl, origin, maxPages = 30, cookieHeader = "") {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];
  const nodes = [];
  const edges = [];

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
            if (new URL(nextUrl).origin === origin && !visited.has(nextUrl) && queue.length < 50) {
              queue.push(nextUrl);
            }
          } catch {}
        }
      } else if (res && res.ok) {
        const html = await res.text().catch(() => "");
        const headersObj = {};
        res.headers.forEach((val, key) => { headersObj[key] = val; });

        pages.push({ url: current, status: res.status, headers: headersObj, body: html, reachable: true });
        const nodeId = `node-${visited.size}`;
        nodes.push({ id: nodeId, url: current, type: current === startUrl ? "root" : "endpoint" });

        const discoveredLinks = extractAllResources(html, current, origin);
        for (const link of discoveredLinks) {
          if (!visited.has(link) && queue.length < 50) {
            try {
              if (new URL(link).origin === origin) {
                queue.push(link);
                edges.push({ from: nodeId, to: link, relation: "links_to" });
              }
            } catch {}
          }
        }
      } else if (res) {
        const html = await res.text().catch(() => "");
        const headersObj = {};
        res.headers.forEach((val, key) => { headersObj[key] = val; });
        pages.push({ url: current, status: res.status, headers: headersObj, body: html, reachable: true });
        const nodeId = `node-${visited.size}`;
        nodes.push({ id: nodeId, url: current, type: "endpoint_error" });
      } else {
        pages.push({ url: current, status: "unreachable", headers: {}, body: "", reachable: false });
      }
    } catch {
      pages.push({ url: current, status: "unreachable", headers: {}, body: "", reachable: false });
    }
  }

  return { nodes, edges, pages };
}

module.exports = { crawlWebsite };
