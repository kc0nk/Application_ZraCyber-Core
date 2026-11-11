module.exports = [
  {
    query: "{ __schema { types { name fields { name } } } }",
    indicator: "__schema",
    title: "GraphQL Introspection Query Enabled",
    severity: "Medium",
    cwe: "CWE-200"
  }
];
