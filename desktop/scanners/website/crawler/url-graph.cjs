function buildUrlGraph(origin) {
  return {
    nodes: [
      { id: "root", url: origin, type: "endpoint" },
      { id: "login", url: `${origin}/login`, type: "auth" },
      { id: "dashboard", url: `${origin}/dashboard`, type: "protected" },
      { id: "api", url: `${origin}/api/v1`, type: "api" }
    ],
    edges: [
      { from: "root", to: "login", relation: "links_to" },
      { from: "root", to: "dashboard", relation: "links_to" },
      { from: "dashboard", to: "api", relation: "fetches" }
    ]
  };
}

module.exports = { buildUrlGraph };
