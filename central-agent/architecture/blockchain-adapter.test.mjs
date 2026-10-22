import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlockchainAdapter, handleContractEvent, validateContractAddress
} from "./blockchain-adapter.mjs";

const adapter = createBlockchainAdapter({ mode: "simulation", chainId: 11155111, maxSpendMinor: 500, maxEventMinor: 300 });
const baseEvent = { chainId: 11155111, contractAddress: "0x1234567890123456789012345678901234567890", idempotencyKey: "evt-1", amountMinor: 200 };
const ledger = () => ({ spentMinor: 0, idempotencyKeys: new Set() });

test("adapter is simulation-only and never enables live transfers", () => {
  assert.equal(adapter.mode, "simulation");
  assert.equal(adapter.liveTransfersEnabled, false);
  assert.throws(() => createBlockchainAdapter({ mode: "live" }), e => e.code === "BLOCKCHAIN_LIVE_MODE_DISABLED");
  assert.throws(() => createBlockchainAdapter({ chainId: 1 }), e => e.code === "BLOCKCHAIN_CHAIN_NOT_ALLOWED");
});

test("rejects malformed contract addresses", () => {
  assert.throws(() => validateContractAddress("https://attacker.invalid"), e => e.code === "BLOCKCHAIN_CONTRACT_ADDRESS_INVALID");
});

test("denies unauthorised event handling", () => {
  assert.equal(handleContractEvent(adapter, ledger(), baseEvent).code, "OWNER_AUTH_REQUIRED");
});

test("accepts an authorized bounded event in simulation only", () => {
  const result = handleContractEvent(adapter, ledger(), baseEvent, { authorized: true });
  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.equal(result.liveTransfer, false);
  assert.equal(result.ledger.spentMinor, 200);
});

test("rejects duplicate idempotency keys", () => {
  const current = { spentMinor: 200, idempotencyKeys: new Set(["evt-1"]) };
  assert.equal(handleContractEvent(adapter, current, baseEvent, { authorized: true }).code, "BLOCKCHAIN_DUPLICATE_EVENT");
});

test("rejects per-event spending-limit violations", () => {
  assert.equal(handleContractEvent(adapter, ledger(), { ...baseEvent, amountMinor: 301 }, { authorized: true }).code, "BLOCKCHAIN_EVENT_LIMIT_EXCEEDED");
});

test("rejects aggregate spending-cap violations", () => {
  const current = { spentMinor: 400, idempotencyKeys: new Set() };
  assert.equal(handleContractEvent(adapter, current, { ...baseEvent, amountMinor: 200 }, { authorized: true }).code, "BLOCKCHAIN_SPENDING_CAP_EXCEEDED");
});

test("rejects chain mismatch", () => {
  assert.equal(handleContractEvent(adapter, ledger(), { ...baseEvent, chainId: 1 }, { authorized: true }).code, "BLOCKCHAIN_CHAIN_MISMATCH");
});
