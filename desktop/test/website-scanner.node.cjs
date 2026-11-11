const test = require("node:test");
const assert = require("node:assert/strict");
const { validateWebsiteTarget } = require("../scanners/website/target-validator.cjs");
const { checkScope } = require("../scanners/website/scope-manager.cjs");
const { runMasterWebRules } = require("../scanners/website/rules/master-web-rules.cjs");

test("Target Validator rejects unconfirmed scope", () => {
  assert.throws(() => {
    validateWebsiteTarget("https://example.com", false);
  }, /Konfirmasi scope/);
});

test("Target Validator accepts valid HTTP/HTTPS URLs", () => {
  const result = validateWebsiteTarget("https://example.com", true);
  assert.equal(result.hostname, "example.com");
  assert.equal(result.protocol, "https:");
});

test("Scope Manager rejects out-of-scope origin", () => {
  assert.throws(() => {
    checkScope("https://attacker.com/page", "https://example.com");
  }, /ditolak karena berada di luar origin scope/);
});

test("Master Web Rules detects missing CSP header", () => {
  const findings = runMasterWebRules("https://example.com", "<html><body>Hello</body></html>", {});
  assert.ok(findings.some(f => f.title.includes("Content Security Policy")));
});
