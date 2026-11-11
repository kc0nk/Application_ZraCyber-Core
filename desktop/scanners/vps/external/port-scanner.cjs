const net = require("node:net");

async function scanPorts(ip, targetPort = 22, additionalPorts = [80, 443, 3306, 5432, 8080]) {
  const portsToScan = Array.from(new Set([Number(targetPort) || 22, ...additionalPorts]));
  const openPorts = [];

  for (const port of portsToScan) {
    const isOpen = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on("connect", () => {
        resolve(true);
        socket.destroy();
      });
      socket.on("timeout", () => {
        resolve(false);
        socket.destroy();
      });
      socket.on("error", () => {
        resolve(false);
      });
      socket.connect(port, ip);
    });
    if (isOpen) openPorts.push(port);
  }
  return openPorts;
}

module.exports = { scanPorts };
