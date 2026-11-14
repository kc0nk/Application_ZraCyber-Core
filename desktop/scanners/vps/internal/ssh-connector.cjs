const crypto = require("node:crypto");
const { Client } = require("ssh2");

const READ_ONLY_CHECKS = {
  identity: "id -un",
  os: "uname -srmo; cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|VERSION_ID)='",
  sshConfig: "sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication) ' || true",
  firewall: "if command -v ufw >/dev/null 2>&1; then ufw status 2>&1; elif command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --state 2>&1; else echo 'firewall tool unavailable'; fi",
  packageUpdates: "if command -v apt-get >/dev/null 2>&1; then apt list --upgradable 2>/dev/null | tail -n +2 | wc -l; elif command -v dnf >/dev/null 2>&1; then dnf -q check-update 2>/dev/null | wc -l; else echo 'package manager unavailable'; fi",
};

function makeError(message, code, hostFingerprint) {
  const error = new Error(message);
  if (code) error.code = code;
  if (hostFingerprint) error.hostFingerprint = hostFingerprint;
  return error;
}

function runRemoteCommand(client, command) {
  return new Promise((resolve, reject) => {
    client.exec(command, { pty: false }, (error, stream) => {
      if (error) return reject(error);
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        stream.close();
        reject(new Error("Perintah audit melewati batas waktu."));
      }, 8000);

      stream.on("data", (chunk) => {
        if (stdout.length < 32_768) stdout += chunk.toString("utf8").slice(0, 32_768 - stdout.length);
      });
      stream.stderr.on("data", (chunk) => {
        if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
      });
      stream.once("error", (streamError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(streamError);
      });
      stream.once("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ output: stdout.trim(), errorOutput: stderr.trim(), exitCode: Number.isInteger(code) ? code : null, signal: signal || null });
      });
    });
  });
}

async function collectReadOnlyEvidence(client) {
  const evidence = {};
  for (const [name, command] of Object.entries(READ_ONLY_CHECKS)) {
    evidence[name] = await runRemoteCommand(client, command);
  }
  return evidence;
}

function connectSsh(target, credentials) {
  const username = String(credentials?.sshUser || "").trim();
  const password = String(credentials?.sshPassword || "");
  const expectedFingerprint = String(credentials?.expectedHostFingerprint || "").trim();
  if (!username) return Promise.reject(new Error("Username SSH wajib diisi."));
  if (!password) return Promise.reject(new Error("Password SSH wajib diisi untuk mode Dengan Login."));
  if (!/^SHA256:[A-Za-z0-9+/]+={0,2}$/.test(expectedFingerprint)) {
    return Promise.reject(new Error("Fingerprint host SSH SHA256 wajib diisi dan diverifikasi melalui kanal tepercaya."));
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    let hostFingerprint = "";
    let serverBanner = "";
    let completed = false;
    const fail = (error) => {
      if (completed) return;
      completed = true;
      client.end();
      if (hostFingerprint && hostFingerprint !== expectedFingerprint) {
        reject(makeError("Fingerprint host SSH tidak cocok. Periksa alamat target atau fingerprint melalui kanal tepercaya.", "SSH_HOST_KEY_MISMATCH", hostFingerprint));
      } else {
        reject(error);
      }
    };

    client.once("ready", async () => {
      try {
        const evidence = await collectReadOnlyEvidence(client);
        if (completed) return;
        completed = true;
        client.end();
        resolve({ connected: true, authenticated: true, hostFingerprint, username, banner: serverBanner, evidence });
      } catch (error) {
        fail(error);
      }
    });
    client.once("banner", (message) => { serverBanner = String(message || "").slice(0, 200); });
    client.once("error", fail);
    client.once("close", () => {
      if (!completed) fail(new Error("Koneksi SSH terputus sebelum autentikasi atau audit selesai."));
    });
    client.connect({
      host: target.ip,
      port: Number(target.port) || 22,
      username,
      password,
      readyTimeout: 15_000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 2,
      hostVerifier: (hostKey) => {
        hostFingerprint = `SHA256:${crypto.createHash("sha256").update(hostKey).digest("base64").replace(/=+$/, "")}`;
        return hostFingerprint === expectedFingerprint;
      },
    });
  });
}

module.exports = { connectSsh };
