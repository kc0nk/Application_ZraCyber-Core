function detectWaf(headers) {
  const server = (headers["server"] || "").toLowerCase();
  const cfRay = headers["cf-ray"];
  if (cfRay || server.includes("cloudflare")) return { wafDetected: true, vendor: "Cloudflare" };
  if (server.includes("aws") || headers["x-amz-cf-id"]) return { wafDetected: true, vendor: "AWS WAF / CloudFront" };
  return { wafDetected: false, vendor: "None / Generic" };
}
module.exports = { detectWaf };
