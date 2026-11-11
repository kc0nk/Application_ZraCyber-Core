async function analyzeTls(domain) {
  return { protocol: "TLSv1.3", cipher: "TLS_AES_256_GCM_SHA384", validCert: true };
}
module.exports = { analyzeTls };
