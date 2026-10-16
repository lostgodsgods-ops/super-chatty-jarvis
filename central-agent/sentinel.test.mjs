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
  constructor() { this.health=[]; this.tables=new Set(); this.archiveRows=[]; }
  prepare(sql) {
    let args=[];
    const db=this;
    return { bind(...v){args=v;return this;}, async run(){
      const create=sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i); if(create) db.tables.add(create[1]);
      if(sql.includes("INSERT INTO sentinel_health_audit")) db.health.push({id:args[0],status:args[1],metrics_json:args[2],checked_at:args[3],archived_at:null});
      if(sql.includes("UPDATE sentinel_health_audit")) { const row=db.health.find(x=>x.id===args[1]); if(row) row.archived_at=args[0]; }
      return {meta:{changes:1}};
    }, async first(){
      if(sql.includes("SELECT 1")) return {ok:1};
      if(sql.includes("sqlite_master")) return {count:db.tables.size};
      if(sql.includes("PRAGMA page_count")) return {page_count:10};
      if(sql.includes("PRAGMA page_size")) return {page_size:4096};
      return null;
    }, async all(){
      if(sql.includes("SELECT id,status,metrics_json,checked_at FROM sentinel_health_audit")) return {results:db.health.filter(x=>!x.archived_at).slice(0,args[0])};
      if(sql.includes("SELECT id,status,metrics_json AS metricsJson")) return {results:db.health.slice().reverse().slice(0,args[0]).map(x=>({...x,metricsJson:x.metrics_json,checkedAt:x.checked_at,archivedAt:x.archived_at}))};
      return {results:[]};
    }};
  }
  async batch(stmts) { for(const s of stmts) await s.run(); return []; }
}
test("sentinel verifies D1 and KV and persists a healthy audit record", async()=>{
  const DB=new FakeDB(), SESSIONS=new FakeKV();
  const result=await runSentinelCycle({DB,SESSIONS},{now:"2026-10-17T00:00:00.000Z"});
  assert.equal(result.ok,true); assert.equal(result.status,"healthy");
  assert.equal(DB.health.length,1); assert.equal(JSON.parse(DB.health[0].metrics_json).d1.estimatedBytes,40960);
  assert.equal((await getSentinelStatus(DB))[0].status,"healthy");
});
test("sentinel fails visibly when KV probe is unavailable and does not claim healthy", async()=>{
  const DB=new FakeDB();
  const result=await runSentinelCycle({DB},{now:"2026-10-17T00:00:00.000Z"});
  assert.equal(result.ok,false); assert.equal(result.status,"degraded");
  assert.equal(result.metrics.kv.error,"KV_BINDING_UNAVAILABLE");
});
test("sentinel archives bounded audit batches to R2 and marks records archived", async()=>{
  const DB=new FakeDB(), SESSIONS=new FakeKV(), objects=new Map();
  const JARVIS_ARCHIVE={async put(key,value){objects.set(key,value)}};
  await runSentinelCycle({DB,SESSIONS,JARVIS_ARCHIVE},{now:"2026-10-17T00:00:00.000Z"});
  await runSentinelCycle({DB,SESSIONS,JARVIS_ARCHIVE},{now:"2026-10-17T00:15:00.000Z"});
  assert.equal(objects.size,1); assert.equal(DB.health[0].archived_at,"2026-10-17T00:15:00.000Z");
});
