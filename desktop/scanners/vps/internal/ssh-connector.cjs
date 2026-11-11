const net = require("node:net");

async function connectSsh(target, credentials) {
  const ip = target.ip;
  const port = Number(target.port) || 22;

  const probe = await new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    socket.setTimeout(3500);
    socket.on("connect", () => {});
    socket.on("data", (chunk) => {
      banner += chunk.toString("utf8").trim();
      socket.destroy();
      resolve({ connected: true, banner: banner.slice(0, 100) });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ connected: false, error: "Connection timeout ke port SSH" });
    });
    socket.on("error", (err) => {
      resolve({ connected: false, error: err.message });
    });
    socket.on("close", () => {
      resolve({ connected: false, error: "Port SSH ditutup atau menolak koneksi" });
    });
    socket.connect(port, ip);
  });

  return probe;
}

module.exports = { connectSsh };
