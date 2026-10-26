import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeAuditPayload,
  hashAuditEntry,
  verifySentinelHashChainRows
} from "./sentinel-integrity.mjs";

const ZERO_HASH = "0".repeat(64);

async function makeChain(payloads) {
  const rows = [];
  let previousHash = ZERO_HASH;
  for (let index = 0; index < payloads.length; index++) {
    const timestamp = `2026-10-26T00:00:0${index}.000Z`;
    const commitSha = "a".repeat(40);
    const canonicalPayload = canonicalizeAuditPayload(payloads[index]);
    const recordHash = await hashAuditEntry(previousHash, timestamp, canonicalPayload, commitSha);
    rows.push({
      sequence: index + 1,
      recordId: String(payloads[index].id),
      previousHash,
      timestamp,
      canonicalPayload,
      commitSha,
      recordHash
    });
    previousHash = recordHash;
  }
  return { rows, head: { sequence: rows.length, headHash: previousHash } };
}

test("Sentinel verifier accepts a valid contiguous hash chain and matching head", async () => {
  const chain = await makeChain([{ id: "a", status: "ok" }, { id: "b", status: "warn" }]);
  assert.deepEqual(await verifySentinelHashChainRows(chain.rows, chain.head), {
    ok: true, verifiedEntries: 2, sequence: 2, headHash: chain.head.headHash
  });
});

test("Sentinel verifier rejects payload tampering even when stored record hash is unchanged", async () => {
  const chain = await makeChain([{ id: "a", status: "ok" }]);
  chain.rows[0].canonicalPayload = canonicalizeAuditPayload({ id: "a", status: "tampered" });
  assert.deepEqual(await verifySentinelHashChainRows(chain.rows, chain.head), {
    ok: false, code: "SENTINEL_RECORD_HASH_MISMATCH", sequence: 1
  });
});

test("Sentinel verifier rejects sequence gaps", async () => {
  const chain = await makeChain([{ id: "a" }, { id: "b" }]);
  chain.rows[1].sequence = 3;
  assert.deepEqual(await verifySentinelHashChainRows(chain.rows, chain.head), {
    ok: false, code: "SENTINEL_SEQUENCE_MISMATCH", sequence: 3
  });
});

test("Sentinel verifier rejects a broken previous-hash link", async () => {
  const chain = await makeChain([{ id: "a" }, { id: "b" }]);
  chain.rows[1].previousHash = "f".repeat(64);
  assert.deepEqual(await verifySentinelHashChainRows(chain.rows, chain.head), {
    ok: false, code: "SENTINEL_PREVIOUS_HASH_MISMATCH", sequence: 2
  });
});

test("Sentinel verifier rejects a head that does not match the verified tail", async () => {
  const chain = await makeChain([{ id: "a" }]);
  chain.head.headHash = "f".repeat(64);
  assert.deepEqual(await verifySentinelHashChainRows(chain.rows, chain.head), {
    ok: false, code: "SENTINEL_HEAD_MISMATCH", sequence: 1
  });
});

test("Sentinel verifier rejects a non-empty head when no chain rows exist", async () => {
  assert.deepEqual(await verifySentinelHashChainRows([], { sequence: 1, headHash: "f".repeat(64) }), {
    ok: false, code: "SENTINEL_HEAD_MISMATCH", sequence: 0
  });
});

import { verifySentinelAuditChain } from "./sentinel-integrity.mjs";

test("persisted Sentinel verifier performs zero database writes", async () => {
  const chain = await makeChain([{ id: "a", status: "ok" }]);
  let writes = 0;
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { writes++; return { success: true, meta: { changes: 0 } }; },
        async all() {
          if (sql.includes("FROM sentinel_hash_chain ORDER BY sequence ASC")) {
            return { results: chain.rows };
          }
          throw new Error("Unexpected query in zero-write verifier test");
        },
        async first() {
          if (sql.includes("FROM sentinel_hash_chain_head")) return chain.head;
          throw new Error("Unexpected query in zero-write verifier test");
        }
      };
    },
    async batch() { writes++; return []; }
  };

  const result = await verifySentinelAuditChain(db);
  assert.equal(result.ok, true);
  assert.equal(writes, 0, "verification must not create tables or initialize the chain head");
});
