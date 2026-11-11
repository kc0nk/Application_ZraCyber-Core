function extractAllResources(html, baseUrl, origin) {
  const links = new Set();

  const pattern = /\b(?:href|action|src)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const raw = match[2].replace(/&amp;/g, "&");
      if (raw.startsWith("data:") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
      const link = new URL(raw, baseUrl);
      link.hash = "";
      if (link.origin === origin) {
        links.add(link.toString());
      }
    } catch {}
  }
  return Array.from(links);
}

module.exports = { extractAllResources };
