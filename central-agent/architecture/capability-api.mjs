import { runIntelCycle } from "./intel-cron.mjs";
import { ingestCapabilitySpec, CapabilityIngestionError } from "./architecture/capability-ingestion.mjs";

export { runIntelCycle, ingestCapabilitySpec, CapabilityIngestionError };

export async function handleCapabilityIngest(request, env) {
  if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST" } });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof body?.url !== "string" || body.url.length > 2048) return Response.json({ error: "INVALID_SPEC_URL" }, { status: 400 });
  try {
    const result = await ingestCapabilitySpec(body.url, env);
    return Response.json(result, { status: 200, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    const status = error instanceof CapabilityIngestionError ? error.status : 503;
    const code = error instanceof CapabilityIngestionError ? error.code : "CAPABILITY_INGESTION_FAILED";
    return Response.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
}
