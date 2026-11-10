const net = require("node:net");

async function scanPorts(ip, ports = [22, 80, 443, 3306, 5432, 6379, 8080]) {
  const openPorts = [];
  for (const port of ports) {
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
