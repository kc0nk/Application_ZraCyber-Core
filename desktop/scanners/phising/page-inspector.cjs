const http = require("node:http");
const https = require("node:https");
const { resolvePublicTarget } = require("./target-validator.cjs");

const MAX_PAGE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

function safeDisplayUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of url.searchParams.keys()) url.searchParams.set(key, "[redacted]");
  return url.toString();
}

function requestPage(url, addresses) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const pinnedAddress = addresses[0];
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      method: "GET",
      path: `${url.pathname || "/"}${url.search}`,
      agent: false,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "Accept-Encoding": "identity",
        "User-Agent": "ZraCore-Phishing-Indicator-Checker/1.0",
        Connection: "close",
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, addresses);
        else callback(null, pinnedAddress.address, pinnedAddress.family);
      },
    }, (response) => {
      const statusCode = Number(response.statusCode) || 0;
      const location = response.headers.location || "";
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        return finish(resolve, { statusCode, location, headers: response.headers, body: "" });
      }

      const contentType = String(response.headers["content-type"] || "");
      let body = Buffer.alloc(0);
      let limited = false;
      response.on("data", (chunk) => {
        if (limited) return;
        const remaining = MAX_PAGE_BYTES - body.length;
        if (chunk.length > remaining) {
          body = Buffer.concat([body, chunk.subarray(0, Math.max(remaining, 0))]);
          limited = true;
          response.destroy();
          finish(resolve, { statusCode, headers: response.headers, contentType, body: body.toString("utf8"), truncated: true });
          return;
        }
        body = Buffer.concat([body, chunk]);
      });
      response.on("end", () => finish(resolve, {
        statusCode,
        headers: response.headers,
        contentType,
        body: body.toString("utf8"),
        truncated: false,
      }));
      response.on("error", (error) => {
        if (!limited) finish(reject, error);
      });
    });

    request.setTimeout(8000, () => request.destroy(new Error("Koneksi target melewati batas waktu 8 detik.")));
    request.on("error", (error) => finish(reject, error));
    request.end();
  });
}

async function inspectPage(initialUrl, initialAddresses) {
  let url = new URL(initialUrl);
  let addresses = initialAddresses;
  let redirects = 0;

  while (true) {
    const response = await requestPage(url, addresses);
    if (!response.location) {
      return {
        finalUrl: safeDisplayUrl(url),
        statusCode: response.statusCode,
        contentType: response.contentType || "",
        headers: response.headers || {},
        html: /^text\/html\b|application\/xhtml\+xml\b/i.test(response.contentType || "") ? response.body : "",
        redirects,
        truncated: Boolean(response.truncated),
      };
    }
    if (redirects >= MAX_REDIRECTS) throw new Error("Terlalu banyak pengalihan; berhenti setelah 3 redirect.");

    const nextUrl = new URL(response.location, url);
    if (!new Set(["http:", "https:"]).has(nextUrl.protocol) || nextUrl.username || nextUrl.password) {
      throw new Error("Pengalihan menuju URL dengan protokol atau kredensial yang tidak diizinkan.");
    }
    addresses = await resolvePublicTarget(nextUrl);
    url = nextUrl;
    redirects += 1;
  }
}

module.exports = { inspectPage, safeDisplayUrl, MAX_PAGE_BYTES, MAX_REDIRECTS };
