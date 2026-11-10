const { normalizeTarget } = require("./target-normalizer");
const { collectUsername } = require("./collectors/username");
const { collectEmail } = require("./collectors/email");
const { collectName } = require("./collectors/name");
const { collectProfile } = require("./collectors/profile");
const { collectWebsite } = require("./collectors/website");
const { createEntity } = require("./identity/entity");
const { buildIdentityGraph } = require("./identity/graph");
const { correlateIdentity } = require("./identity/correlation");
const { calculateConfidence } = require("./identity/confidence");
const { analyzeIdentityWithAi } = require("./ai/identity-analysis");
const { generateIdentityReport } = require("./report/identity-report");

async function runOsintOrchestrator(inputBody, apiKey) {
  const target = normalizeTarget(inputBody);

  const [uProfiles, eProfiles, nProfiles, wProfiles] = await Promise.all([
    collectUsername(target.username),
    collectEmail(target.email),
    collectName(target.name, target.aliases),
    collectWebsite(target.domain)
  ]);

  const allRawProfiles = [...uProfiles, ...eProfiles, ...nProfiles, ...wProfiles];
  const profiles = collectProfile(allRawProfiles);
  const entity = createEntity(target, profiles);
  const graph = buildIdentityGraph(entity, profiles);
  const correlation = correlateIdentity(graph);
  const confidence = calculateConfidence(graph, correlation);

  const candidateData = {
    candidate: "candidate-001",
    target,
    profiles,
    relationships: graph.relationships,
    confidence
  };

  const aiAnalysis = await analyzeIdentityWithAi(candidateData, apiKey);
  const report = generateIdentityReport(target, allRawProfiles, graph, correlation, confidence, aiAnalysis);

  return report;
}

module.exports = { runOsintOrchestrator };
