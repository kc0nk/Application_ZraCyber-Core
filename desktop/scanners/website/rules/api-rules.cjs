const graphqlPayloads = require("../payloads/graphql-payloads.cjs");

function applyApiRules(url, htmlContent, headers) {
  const findings = [];
  if (url.includes("graphql") || htmlContent.includes("__schema")) {
    findings.push({
      title: "GraphQL Introspection Enabled",
      severity: "Medium",
      cwe: "CWE-200",
      evidence: ["GraphQL endpoint schema exposed publicly"],
      location: url,
      check: "API Security - GraphQL",
      summary: "Endpoint GraphQL mengaktifkan query introspection, mengekspos seluruh skema database dan mutasi ke publik."
    });
  }
  return findings;
}

module.exports = { applyApiRules };
