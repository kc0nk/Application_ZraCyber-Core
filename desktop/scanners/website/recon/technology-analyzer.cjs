function analyzeTechnology(headers) {
  const server = headers["server"] || "Unknown";
  const poweredBy = headers["x-powered-by"] || "";
  return { server, poweredBy, stack: poweredBy ? [server, poweredBy] : [server] };
}
module.exports = { analyzeTechnology };
