const { isIP } = require("node:net");
const { lookup } = require("node:dns/promises");
const ipaddr = require("ipaddr.js");

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_URL_LENGTH = 2048;

function assertPublicAddress(address) {
  let parsed;
  try {
    parsed = ipaddr.process(address);
  } catch {
    throw new Error("Alamat IP target tidak valid.");
  }
  if (parsed.range() !== "unicast") {
    throw new Error("Target mengarah ke alamat privat, lokal, atau reserved; pemindaian dibatasi ke host publik.");
  }
  return { address: parsed.toString(), family: parsed.kind() === "ipv4" ? 4 : 6 };
}

async function resolvePublicTarget(url) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return [assertPublicAddress(host)];

  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Domain target tidak dapat di-resolve ke alamat publik.");
  }
  if (!addresses.length) throw new Error("Domain target tidak memiliki alamat IP.");

  // Reject mixed public/private DNS answers to avoid internal-address rebinding.
  return addresses.map(({ address }) => assertPublicAddress(address));
}

async function validatePhisingTarget(rawTarget) {
  const input = String(rawTarget || "").trim();
  if (!input) throw new Error("Masukkan URL website yang ingin diperiksa.");
  if (input.length > MAX_URL_LENGTH) throw new Error(`URL maksimal ${MAX_URL_LENGTH} karakter.`);

  let url;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    throw new Error("URL tidak valid. Contoh: https://example.com/login");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new Error("Hanya URL HTTP atau HTTPS yang didukung.");
  if (!url.hostname || url.hostname.includes("%") || url.hostname.endsWith(".")) {
    throw new Error("Nama host target tidak valid.");
  }

  const hadUserInfo = Boolean(url.username || url.password);
  // Never forward URL-embedded credentials to the target.
  url.username = "";
  url.password = "";
  const addresses = await resolvePublicTarget(url);
  return { url, addresses, hadUserInfo };
}

module.exports = { validatePhisingTarget, resolvePublicTarget, assertPublicAddress };
