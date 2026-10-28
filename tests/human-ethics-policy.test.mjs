import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const matrix = JSON.parse(await readFile(
  new URL("../docs/human-ethics-controls.json", import.meta.url), "utf8"
));
const markdown = await readFile(
  new URL("../docs/REDULTRON_HUMAN_ETHICS_CONTROL_MATRIX.md", import.meta.url), "utf8"
);

const requiredPrinciples = [
  "dignity",
  "autonomy",
  "informed-consent",
  "privacy",
  "fairness",
  "accessibility",
  "transparency",
  "accountability",
  "harm-minimization",
  "child-safety",
  "security",
  "human-oversight"
];

test("human ethics matrix covers every required principle with testable controls", () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.project, "REDULTRON CORE 3.0");
  assert.equal(matrix.policyIsProofOfCompliance, false);
  assert.equal(matrix.controls.length, requiredPrinciples.length);
  assert.deepEqual(matrix.controls.map(item => item.id), requiredPrinciples);

  for (const item of matrix.controls) {
    assert.ok(item.title && item.risk, `${item.id} needs a title and risk statement`);
    assert.ok(Array.isArray(item.controls) && item.controls.length >= 2,
      `${item.id} needs concrete controls`);
    assert.ok(Array.isArray(item.acceptanceTests) && item.acceptanceTests.length >= 2,
      `${item.id} needs testable acceptance criteria`);
    assert.ok(Array.isArray(item.sources) && item.sources.length > 0,
      `${item.id} needs authoritative sources`);
    for (const requirement of item.acceptanceTests) {
      assert.equal(typeof requirement.id, "string");
      assert.match(requirement.id, /^[A-Z0-9-]+$/);
      assert.equal(typeof requirement.requirement, "string");
      assert.ok(requirement.requirement.length >= 20);
      assert.equal(typeof requirement.verification, "string");
      assert.ok(requirement.verification.length >= 8);
    }
    for (const sourceId of item.sources) {
      assert.ok(matrix.sources[sourceId], `${item.id} references unknown source ${sourceId}`);
    }
  }
});

test("ethics source catalog uses authoritative primary sources", () => {
  const expectedDomains = [
    "www.un.org",
    "www.unesco.org",
    "www.oecd.org",
    "www.nist.gov",
    "www.w3.org",
    "asvs.owasp.org",
    "www.unicef.org",
    "www.meity.gov.in",
    "eur-lex.europa.eu"
  ];
  for (const domain of expectedDomains) {
    assert.ok(Object.values(matrix.sources).some(source => {
      try { return new URL(source.url).hostname === domain; } catch { return false; }
    }), `missing authoritative source domain ${domain}`);
  }
  for (const [id, source] of Object.entries(matrix.sources)) {
    assert.ok(source.title, `${id} needs a title`);
    assert.match(source.url, /^https:\/\//, `${id} must use HTTPS`);
    assert.equal(source.type, "primary", `${id} must be a primary source`);
  }
});

test("ethics policy preserves owner control, privacy, and fail-closed behavior", () => {
  for (const phrase of [
    "owner approval",
    "fail closed",
    "emergency stop",
    "never expose secrets",
    "no autonomous installation or execution",
    "not a claim of legal compliance"
  ]) {
    assert.ok(markdown.toLowerCase().includes(phrase),
      `policy must explicitly preserve: ${phrase}`);
  }
  for (const id of requiredPrinciples) {
    assert.ok(markdown.includes(id), `policy summary must mention ${id}`);
  }
});

test("the matrix distinguishes a control requirement from evidence that it is implemented", () => {
  assert.equal(matrix.policyIsProofOfCompliance, false);
  assert.equal(matrix.policyIsProofOfImplementation, false);
  assert.equal(matrix.productionVerificationRequired, true);
  assert.equal(matrix.ownerApprovalRequiredForSensitiveActions, true);
  assert.equal(matrix.externalContentIsUntrustedData, true);
});
