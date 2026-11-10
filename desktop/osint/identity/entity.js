function createEntity(target, profiles) {
  return {
    person_candidate: target.name || target.username || "Candidate-001",
    username: target.username,
    email: target.email,
    profile: profiles,
    website: target.domain,
    avatar: profiles.find(p => p.avatar)?.avatar || "",
    organization: ""
  };
}

module.exports = { createEntity };
