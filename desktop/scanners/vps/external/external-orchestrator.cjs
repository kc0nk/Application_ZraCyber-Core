const { scanPorts } = require("./port-scanner.cjs");
const { analyzeDns } = require("./dns-analyzer.cjs");

async function runExternalScan(ip, port = 22) {
  const openPorts = await scanPorts(ip, port, [80, 443, 3306, 5432, 6379, 8080]);
  const dns = await analyzeDns(ip);

  const evidence = [
    { type: "open_ports", symbol: openPorts.join(", "), location: `${ip}:${port}`, confidence: 1.0 },
    { type: "dns_info", symbol: JSON.stringify(dns), location: ip, confidence: 0.95 }
  ];

  return { scanMode: "external", ip, port, openPorts, dns, evidence };
}

module.exports = { runExternalScan };
