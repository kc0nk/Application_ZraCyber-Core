function buildIdentityGraph(entity, profiles) {
  const relationships = [];
  if (entity.username) {
    profiles.forEach(p => {
      relationships.push(`USES_USERNAME: ${entity.username} -> ${p.platform}`);
    });
  }
  return { entity, relationships };
}

module.exports = { buildIdentityGraph };
