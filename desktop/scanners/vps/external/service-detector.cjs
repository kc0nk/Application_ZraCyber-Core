async function detectServices(openPorts) {
  return openPorts.map(p => ({ port: p, service: p === 22 ? "ssh" : p === 443 ? "https" : p === 80 ? "http" : "unknown" }));
}
module.exports = { detectServices };
