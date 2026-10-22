import test from "node:test";
import assert from "node:assert/strict";
import { appendTreasuryEvent, ensureTreasurySchema } from "./treasury-ledger.mjs";

function fakeDB({ total = 0, changes = 1 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        bind(...values) {
          calls.push(values);
          return {
            run: async () => ({ success: true, meta: { changes, last_row_id: 7 } }),
            first: async () => ({ total }),
            all: async () => ({ results: [] })
          };
        },
        run: async () => ({ success: true, meta: { changes } }),
        first: async () => ({ total })
      };
    }
  };
}
const event = {
  idempotencyKey: "pay-001", source: "web3", eventType: "payment_intent",
  amountMinor: 100, currency: "TOKEN_MINOR", network: "sepolia",
  contractAddress: "0x1234567890123456789012345678901234567890", manualApproval: true
};

test("creates ledger table and index", async () => {
  const db = fakeDB();
  await ensureTreasurySchema(db);
  assert.ok(db.calls.some(sql => String(sql).includes("CREATE TABLE IF NOT EXISTS treasury_events")));
  assert.ok(db.calls.some(sql => String(sql).includes("CREATE INDEX IF NOT EXISTS idx_treasury_events_created_at")));
});

test("writes a simulation-only event without executing an external transfer", async () => {
  const result = await appendTreasuryEvent(fakeDB(), event);
  assert.equal(result.ok, true);
  assert.equal(result.ledgerMode, "simulation-only");
  assert.equal(result.event.details.externalTransferExecuted, false);
  assert.equal(result.event.details.livePaymentsEnabled, false);
});

test("rejects payment intent without explicit manual approval", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB(), { ...event, manualApproval: false }), e => e.code === "TREASURY_MANUAL_APPROVAL_REQUIRED");
});

test("rejects invalid EVM contract address", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB(), { ...event, contractAddress: "https://invalid.example" }), e => e.code === "TREASURY_CONTRACT_ADDRESS_INVALID");
});

test("rejects event amounts above hard per-event cap", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB(), { ...event, amountMinor: 1001 }), e => e.code === "TREASURY_EVENT_SPEND_CAP_EXCEEDED");
});

test("rejects event if aggregate daily cap would be exceeded", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB({ total: 4950 }), event), e => e.code === "TREASURY_DAILY_SPENDING_CAP_EXCEEDED");
});

test("rejects duplicate idempotency key", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB({ changes: 0 }), event), e => e.code === "TREASURY_DUPLICATE_IDEMPOTENCY_KEY");
});

test("rejects mainnet and unknown network requests", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB(), { ...event, network: "ethereum-mainnet" }), e => e.code === "TREASURY_NETWORK_NOT_ALLOWED");
});

test("rejects live payment attempts", async () => {
  await assert.rejects(() => appendTreasuryEvent(fakeDB(), { ...event, livePayment: true }), e => e.code === "TREASURY_EVENT_INVALID");
});
