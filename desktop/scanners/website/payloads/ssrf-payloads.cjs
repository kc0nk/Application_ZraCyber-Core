module.exports = [
  { payload: "http://169.254.169.254/latest/meta-data/", indicator: "ami-id", title: "Server-Side Request Forgery (SSRF) to AWS Metadata", severity: "Critical", cwe: "CWE-918" },
  { payload: "http://127.0.0.1:80/admin", indicator: "admin dashboard", title: "SSRF to Internal Loopback Service", severity: "High", cwe: "CWE-918" }
];
