const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { validateWebsiteTarget } = require("./target-validator.cjs");
const { checkScope } = require("./scope-manager.cjs");
const { analyzeDnsRecon } = require("./recon/dns-analyzer.cjs");
const { crawlWebsite } = require("./crawler/crawler-engine.cjs");
const { applyInjectionRules } = require("./rules/injection-rules.cjs");
const { applyApiRules } = require("./rules/api-rules.cjs");
const { applyConfigurationRules } = require("./rules/configuration-rules.cjs");
const { correlateFindingsWithAi } = require("../../ai/finding-correlator.cjs");
const { generateWriteupReport } = require("../../ai/writeup-generator.cjs");
const { calculateRisk } = require("../../core/risk-engine.cjs");

async function runWebsiteOrchestrator(body, apiKey) {
  const target = validateWebsiteTarget(body.targetUrl, body.scopeConfirmed);
  checkScope(target.url, target.origin);

  const dns = await analyzeDnsRecon(target.hostname);
  const crawlResult = await crawlWebsite(target.url, target.origin, 20);
  const urlGraph = { nodes: crawlResult.nodes, edges: crawlResult.edges };

  let ruleFindings = [];
  for (const page of crawlResult.pages) {
    const inj = applyInjectionRules(page.url, page.body);
    const api = applyApiRules(page.url, page.body, page.headers);
    const cfg = applyConfigurationRules(page.url, page.headers);
    ruleFindings.push(...inj, ...api, ...cfg);
  }

  if (ruleFindings.length === 0) {
    ruleFindings.push({
      title: "Secure Headers & TLS Configuration Analyzed",
      severity: "Info",
      cwe: "CWE-693",
      evidence: [`Crawled ${crawlResult.pages.length} pages successfully`],
      location: target.origin,
      check: "Security Rule Engine - Baseline",
      summary: `Target web berhasil dicrawl (${crawlResult.pages.length} halaman). Tidak ditemukan indikasi celah kritis pada pemindaian pasif.`
    });
  }

  const correlatedFindings = await correlateFindingsWithAi(urlGraph, ruleFindings, apiKey);
  const riskResult = calculateRisk(correlatedFindings);
  const report = generateWriteupReport(target, dns, urlGraph, correlatedFindings, riskResult.stats);

  return report;
}

module.exports = { runWebsiteOrchestrator };
