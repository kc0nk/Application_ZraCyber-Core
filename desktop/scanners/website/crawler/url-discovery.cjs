function extractFormsAndResources(html, baseUrl, origin) {
  const links = new Set();
  const forms = [];

  const pattern = /\b(?:href|action|src|data-url|data-href)\s*=\s*(["'])(.*?)\1/gi;
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

  const pathPattern = /(?:["'`])(\/[a-zA-Z0-9_\-\/\.\?=&]+)(?:["'`])/g;
  for (const match of html.matchAll(pathPattern)) {
    try {
      const raw = match[1];
      if (raw.length > 1 && !raw.endsWith(".css") && !raw.endsWith(".png") && !raw.endsWith(".jpg") && !raw.endsWith(".svg") && !raw.endsWith(".ico") && !raw.endsWith(".woff") && !raw.endsWith(".woff2")) {
        const link = new URL(raw, baseUrl);
        link.hash = "";
        if (link.origin === origin) {
          links.add(link.toString());
        }
      }
    } catch {}
  }

  const formRegex = /<form([\s\S]*?)<\/form>/gi;
  for (const formMatch of html.matchAll(formRegex)) {
    const formHtml = formMatch[1];
    let actionMatch = formHtml.match(/action=["']([^"']+)["']/i);
    let methodMatch = formHtml.match(/method=["']([^"']+)["']/i);
    let actionUrl = baseUrl;
    if (actionMatch) {
      try {
        actionUrl = new URL(actionMatch[1], baseUrl).toString();
      } catch {}
    }
    const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";

    const inputNames = [];
    const inputRegex = /<(?:input|textarea|select)[^>]+name=["']([^"']+)["']/gi;
    for (const inputMatch of formHtml.matchAll(inputRegex)) {
      if (inputMatch[1]) inputNames.push(inputMatch[1]);
    }

    if (inputNames.length > 0) {
      forms.push({ actionUrl, method, inputNames });
    }
  }

  return { links: Array.from(links), forms };
}

module.exports = { extractFormsAndResources };
