import test from "node:test";
import assert from "node:assert/strict";
import { createSandboxLedger, postSandboxTransaction } from "../central-agent/architecture/finance-sandbox.mjs";

test("sandbox ledger starts at zero and is simulation-only", () => {
  const ledger = createSandboxLedger();
  assert.equal(ledger.balanceMinor, 0);
  assert.equal(ledger.mode, "simulation-only");
  assert.equal(ledger.livePaymentsEnabled, false);
});

test("credit and debit update integer minor-unit balance", () => {
  let ledger = createSandboxLedger();
  let result = postSandboxTransaction(ledger, { idempotencyKey: "credit-1", kind: "credit", amountMinor: 1250, note: "test credit" });
  assert.equal(result.ok, true);
  ledger = result.ledger;
  result = postSandboxTransaction(ledger, { idempotencyKey: "debit-1", kind: "debit", amountMinor: 250, note: "test debit" });
  assert.equal(result.ok, true);
  assert.equal(result.ledger.balanceMinor, 1000);
});

test("ledger rejects overdrafts, invalid amounts and missing idempotency keys", () => {
  const ledger = createSandboxLedger({ balanceMinor: 100 });
  assert.equal(postSandboxTransaction(ledger, { idempotencyKey: "over", kind: "debit", amountMinor: 101 }).error, "INSUFFICIENT_SANDBOX_BALANCE");
  assert.equal(postSandboxTransaction(ledger, { idempotencyKey: "zero", kind: "credit", amountMinor: 0 }).error, "INVALID_AMOUNT");
  assert.equal(postSandboxTransaction(ledger, { kind: "credit", amountMinor: 1 }).error, "IDEMPOTENCY_KEY_REQUIRED");
});

test("same idempotency key cannot apply a transaction twice", () => {
  let ledger = createSandboxLedger();
  ledger = postSandboxTransaction(ledger, { idempotencyKey: "same", kind: "credit", amountMinor: 400 }).ledger;
  const duplicate = postSandboxTransaction(ledger, { idempotencyKey: "same", kind: "credit", amountMinor: 400 });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "DUPLICATE_IDEMPOTENCY_KEY");
  assert.equal(duplicate.ledger.balanceMinor, 400);
});

test("live-payment requests are always rejected by the sandbox", () => {
  const result = postSandboxTransaction(createSandboxLedger(), {
    idempotencyKey: "live", kind: "credit", amountMinor: 500, livePayment: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "LIVE_PAYMENTS_DISABLED");
});
