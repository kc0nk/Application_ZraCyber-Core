function buildIdentityGraph(entity, profiles) {
  const relationships = [];
  if (entity.username) {
    profiles.forEach(p => {
      relationships.push(`USES_USERNAME: ${entity.username} -> ${p.platform}`);
    });
  }
  if (entity.email) {
    relationships.push(`REFERENCES_EMAIL: ${entity.email} -> Target Identity`);
  }
  return { entity, relationships };
}

module.exports = { buildIdentityGraph };
