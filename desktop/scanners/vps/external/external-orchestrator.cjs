const { scanPorts } = require("./port-scanner.cjs");
const { analyzeDns } = require("./dns-analyzer.cjs");
const http = require("node:http");

function isLoopback(ip) {
  return ip === "localhost" || ip === "127.0.0.1" || ip === "::1";
}

function loadLocalLabProfile(ip, port) {
  if (!isLoopback(ip)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = http.get({ hostname: ip, port, path: "/target", timeout: 1500 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          const profile = JSON.parse(body);
          if (!Array.isArray(profile.anomalies) || !Array.isArray(profile.services)) return resolve(null);
          resolve(profile);
        } catch {
          resolve(null);
        }
      });
    });

    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(null));
  });
}

async function runExternalScan(ip, port = 22) {
  const [openPorts, dns, labProfile] = await Promise.all([
    scanPorts(ip, port, [80, 443, 3306, 5432, 6379, 8080]),
    analyzeDns(ip),
    loadLocalLabProfile(ip, port),
  ]);

  const evidence = [
    { type: "open_ports", symbol: openPorts.join(", "), location: `${ip}:${port}`, confidence: 1.0 },
    { type: "dns_info", symbol: JSON.stringify(dns), location: ip, confidence: 0.95 }
  ];

  if (labProfile) {
    evidence.push({
      type: "vps_lab_profile",
      symbol: `${labProfile.anomalies.length} seeded anomalies; ${labProfile.services.length} simulated services`,
      location: `http://${ip}:${port}/target`,
      confidence: 1.0,
    });
  }

  return { scanMode: "external", ip, port, openPorts, dns, evidence, labProfile };
}

module.exports = { runExternalScan };
