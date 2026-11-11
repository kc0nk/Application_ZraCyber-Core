async function analyzeBanner(service) {
  return { banner: "OpenSSH_8.9p1 Ubuntu-3ubuntu0.6", risk: "Low" };
}
module.exports = { analyzeBanner };
