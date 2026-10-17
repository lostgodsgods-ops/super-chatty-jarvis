import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true,writable:true});
import { guardRequest } from "./edge-guard.mjs";
class FakeKV { constructor(){this.values=new Map()} async get(k){return this.values.get(k)??null} async put(k,v){this.values.set(k,String(v))} }
function request(path,ip="192.0.2.4"){return new Request("https://example.test"+path,{headers:{"cf-connecting-ip":ip}})}
test("honeypot probe receives a generic not-found and temporarily blocks same source",async()=>{
 const kv=new FakeKV(); const env={SESSIONS:kv};
 const first=await guardRequest(request("/.env"),env,1000000);
 assert.equal(first.status,404);
 const second=await guardRequest(request("/health"),env,1000001);
 assert.equal(second.status,403);
});
test("API requests are rate-limited by hashed source and route",async()=>{
 const kv=new FakeKV(), env={SESSIONS:kv};
 for(let i=0;i<90;i++) assert.equal(await guardRequest(request("/api/memory"),env,1200000),null);
 const blocked=await guardRequest(request("/api/memory"),env,1200000);
 assert.equal(blocked.status,429);
});
test("requests without a source IP are not globally rate-limited",async()=>{
 const result=await guardRequest(new Request("https://example.test/api/memory"),{SESSIONS:new FakeKV()});
 assert.equal(result,null);
});

class FakeRateLimitDB {
 constructor(){this.rows=new Map()}
 prepare(sql){
  if(sql.startsWith("CREATE TABLE IF NOT EXISTS edge_rate_limits")) return {run:async()=>({success:true})};
  return {bind:(key,window)=>({first:async()=>{
   const previous=this.rows.get(key);
   const request_count=previous&&previous.window===window?previous.request_count+1:1;
   this.rows.set(key,{window,request_count});
   return {request_count};
  }})};
 }
}
test("rate-limit KV write exhaustion falls back to D1 for credential routes",async()=>{
 const kv=new FakeKV();
 kv.put=async(key,value)=>{ if(String(key).startsWith("edge:rate:")) throw new Error("KV write quota exhausted"); kv.values.set(key,String(value)); };
 const env={SESSIONS:kv,DB:new FakeRateLimitDB()};
 assert.equal(await guardRequest(request("/api/chat"),env,1800000),null);
 assert.equal(await guardRequest(request("/auth/session"),env,1800001),null);
 const loginRequest=()=>new Request("https://example.test/auth/login",{method:"POST",headers:{"cf-connecting-ip":"192.0.2.4"}});
 for(let i=0;i<12;i++) assert.equal(await guardRequest(loginRequest(),env,1800002+i),null);
 const limited=await guardRequest(loginRequest(),env,1800015);
 assert.equal(limited.status,429);
 assert.equal(limited.headers["retry-after"]!==undefined,true);
 await assert.rejects(()=>guardRequest(loginRequest(),{SESSIONS:kv},1800016),/KV write quota exhausted/);
});
