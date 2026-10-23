import test from "node:test";
import assert from "node:assert/strict";
import { runSentinelCycle, getSentinelStatus } from "./sentinel.mjs";

class FakeKV {
  constructor() { this.values = new Map(); }
  async put(k,v) { this.values.set(k,String(v)); }
  async get(k) { return this.values.get(k) ?? null; }
  async delete(k) { this.values.delete(k); }
}
class FakeDB {
  constructor() { this.health=[]; this.tables=new Set(); }
  prepare(sql) {
    let args=[];
    const db=this;
    return { bind(...v){args=v;return this;}, async run(){
      const create=sql.match(/CREATE TABLE IF NOT EXISTS (\\w+)/i); if(create) db.tables.add(create[1]);
      if(sql.includes("INSERT INTO sentinel_health_audit")) db.health.push({id:args[0],status:args[1],metrics_json:args[2],checked_at:args[3],archived_at:null});
      return {meta:{changes:1}};
    }, async first(){
      if(sql.includes("SELECT 1")) return {ok:1};
      if(sql.includes("sqlite_master")) return {count:db.tables.size};
      if(sql.includes("PRAGMA page_count")) return {page_count:10};
      if(sql.includes("PRAGMA page_size")) return {page_size:4096};
      return null;
    }, async all(){
      if(sql.includes("SELECT id,status,metrics_json AS metricsJson")) return {results:db.health.slice().reverse().slice(0,args[0]).map(x=>({...x,metricsJson:x.metrics_json,checkedAt:x.checked_at,archivedAt:x.archived_at}))};
      return {results:[]};
    }};
  }
  async batch(stmts) { for(const s of stmts) await s.run(); return []; }
}
test("sentinel verifies D1 without KV writes and persists a healthy audit record", async()=>{
  const DB=new FakeDB(), SESSIONS=new FakeKV();
  const result=await runSentinelCycle({DB,SESSIONS},{now:"2026-10-17T00:00:00.000Z"});
  assert.equal(result.ok,true); assert.equal(result.status,"healthy");
  assert.equal(DB.health.length,1); assert.equal(JSON.parse(DB.health[0].metrics_json).d1.estimatedBytes,40960);
  assert.equal(JSON.parse(DB.health[0].metrics_json).storageMode,"d1-authoritative");
  assert.equal(JSON.parse(DB.health[0].metrics_json).kv.checked,true);
  assert.equal(JSON.parse(DB.health[0].metrics_json).kv.ok,true);
  assert.equal(JSON.parse(DB.health[0].metrics_json).kv.operation,"read-only-get");
  assert.equal(SESSIONS.values.size,0,"Sentinel must not write to KV");
  assert.equal((await getSentinelStatus(DB))[0].status,"healthy");
});

test("sentinel reports KV read failure accurately without mutating data or masking D1 status", async()=>{
  const DB=new FakeDB();
  const SESSIONS={async get(){throw new Error("KV read unavailable");}};
  const result=await runSentinelCycle({DB,SESSIONS},{now:"2026-10-17T00:00:00.000Z"});
  assert.equal(result.ok,true);
  assert.equal(result.status,"healthy");
  assert.equal(result.metrics.d1.ok,true);
  assert.equal(result.metrics.kv.checked,true);
  assert.equal(result.metrics.kv.ok,false);
  assert.equal(result.metrics.kv.operation,"read-only-get");
  assert.equal(DB.health.length,1);
});
test("sentinel remains healthy when KV is unavailable because KV is not a readiness dependency", async()=>{
  const DB=new FakeDB();
  const result=await runSentinelCycle({DB},{now:"2026-10-17T00:00:00.000Z"});
  assert.equal(result.ok,true); assert.equal(result.status,"healthy");
  assert.equal(result.metrics.kv.checked,false);
});
test("sentinel persists successive audit records in D1 without any archive binding", async()=>{
  const DB=new FakeDB(), SESSIONS=new FakeKV();
  const unusedArchive={async put(){throw new Error("R2 binding must never be called")}};
  const first=await runSentinelCycle({DB,SESSIONS,JARVIS_ARCHIVE:unusedArchive,ARCHIVE:unusedArchive},{now:"2026-10-17T00:00:00.000Z"});
  const second=await runSentinelCycle({DB,SESSIONS},{now:"2026-10-17T00:15:00.000Z"});
  assert.equal(first.ok,true); assert.equal(second.ok,true);
  assert.equal(DB.health.length,2);
  assert.equal(JSON.parse(DB.health[0].metrics_json).storageMode,"d1-authoritative");
  assert.equal("archive" in JSON.parse(DB.health[0].metrics_json),false);
  assert.equal((await getSentinelStatus(DB,10)).length,2);
});


test("sentinel audit hash chain preserves canonical payload identity", async () => {
  const { canonicalizeAuditPayload, sha256Hex } = await import("./sentinel-integrity.mjs");
  const firstPayload = canonicalizeAuditPayload({ status: "healthy", metrics: { d1: true, kv: false } });
  const reorderedPayload = canonicalizeAuditPayload({ metrics: { kv: false, d1: true }, status: "healthy" });
  assert.equal(firstPayload, reorderedPayload);
  const firstHash = await sha256Hex("0".repeat(64) + "\\n" + "2026-10-23T00:00:00.000Z" + "\\n" + firstPayload + "\\n" + "25abd1d");
  const tamperedHash = await sha256Hex("0".repeat(64) + "\\n" + "2026-10-23T00:00:00.000Z" + "\\n" + firstPayload.replace("healthy", "degraded") + "\\n" + "25abd1d");
  assert.match(firstHash, /^[0-9a-f]{64}$/);
  assert.notEqual(firstHash, tamperedHash);
});
