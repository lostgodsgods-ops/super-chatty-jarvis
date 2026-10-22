/**
 * Universal provider catalog for REDULTRON.
 *
 * This module reports catalog/configuration state only. It never probes providers,
 * executes tools, or treats a binding as proof of authentication or health.
 * Credentials are referenced by binding name and are never returned.
 */
const PROVIDERS = Object.freeze([
  ["openai","llm","https://api.openai.com",["OPENAI_API_KEY"],["chat","embeddings"]],
  ["anthropic","llm","https://api.anthropic.com",["ANTHROPIC_API_KEY"],["chat"]],
  ["google-gemini","llm","https://generativelanguage.googleapis.com",["GEMINI_API_KEY"],["chat","embeddings"]],
  ["deepseek","llm","https://api.deepseek.com",["DEEPSEEK_API_KEY"],["chat"]],
  ["cohere","llm","https://api.cohere.com",["COHERE_API_KEY"],["chat","embeddings"]],
  ["mistral","llm","https://api.mistral.ai",["MISTRAL_API_KEY"],["chat","embeddings"]],
  ["groq","llm","https://api.groq.com",["GROQ_API_KEY"],["chat"]],
  ["together-ai","llm","https://api.together.xyz",["TOGETHER_API_KEY"],["chat","embeddings"]],
  ["fireworks-ai","llm","https://api.fireworks.ai",["FIREWORKS_API_KEY"],["chat"]],
  ["replicate","model-hosting","https://api.replicate.com",["REPLICATE_API_TOKEN"],["model-run"]],
  ["tavily","search","https://api.tavily.com",["TAVILY_API_KEY"],["web-search"]],
  ["firecrawl","search","https://api.firecrawl.dev",["FIRECRAWL_API_KEY"],["scrape","extract"]],
  ["exa","search","https://api.exa.ai",["EXA_API_KEY"],["web-search"]],
  ["scrapingbee","search","https://app.scrapingbee.com",["SCRAPINGBEE_API_KEY"],["scrape"]],
  ["val-town","serverless","https://api.val.town",["VAL_TOWN_API_TOKEN"],["script-run"]],
  ["browserless","browser","https://production-sfo.browserless.io",["BROWSERLESS_API_TOKEN"],["browser"]],
  ["jina-ai","search","https://api.jina.ai",["JINA_API_KEY"],["reader","embeddings"]],
  ["cloudflare","hosting","https://api.cloudflare.com",["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"],["workers","d1","kv"]],
  ["railway","hosting","https://backboard.railway.app",["RAILWAY_API_TOKEN"],["deploy"]],
  ["render","hosting","https://api.render.com",["RENDER_API_KEY"],["deploy"]],
  ["supabase","database","https://api.supabase.com",["SUPABASE_ACCESS_TOKEN"],["database","edge-functions"]],
  ["neon","database","https://console.neon.tech/api/v2",["NEON_API_KEY"],["postgres"]],
  ["upstash","database","https://api.upstash.com",["UPSTASH_EMAIL","UPSTASH_API_KEY"],["redis","kafka"]],
  ["planetscale","database","https://api.planetscale.com",["PLANETSCALE_SERVICE_TOKEN"],["mysql"]],
  ["pinecone","vector","https://api.pinecone.io",["PINECONE_API_KEY","PINECONE_INDEX_HOST"],["vector-search"]],
  ["qdrant","vector","https://api.qdrant.tech",["QDRANT_API_KEY","QDRANT_URL"],["vector-search"]],
  ["portkey","llm-gateway","https://api.portkey.ai",["PORTKEY_API_KEY"],["model-routing"]],
  ["temporal","orchestration","https://api.temporal.io",["TEMPORAL_API_KEY"],["durable-workflows"]],
  ["e2b","sandbox","https://api.e2b.dev",["E2B_API_KEY"],["sandbox"]],
  ["make","automation","https://www.make.com",["MAKE_API_TOKEN"],["workflow"]],
  ["n8n","automation","https://api.n8n.io",["N8N_API_KEY","N8N_BASE_URL"],["workflow"]],
  ["resend","messaging","https://api.resend.com",["RESEND_API_KEY"],["email"]],
  ["weights-and-biases","observability","https://api.wandb.ai",["WANDB_API_KEY"],["experiments"]],
  ["langsmith","observability","https://api.smith.langchain.com",["LANGSMITH_API_KEY"],["tracing"]],
  ["langgraph","orchestration","https://api.langgraph.cloud",["LANGGRAPH_API_KEY"],["agents"]],
  ["autogen","agent-framework","https://github.com/microsoft/autogen",[],["local-framework"]],
  ["crewai","agent-framework","https://github.com/crewAIInc/crewAI",[],["local-framework"]],
  ["modal","serverless","https://api.modal.com",["MODAL_TOKEN_ID","MODAL_TOKEN_SECRET"],["python-functions"]],
  ["elevenlabs","voice","https://api.elevenlabs.io",["ELEVENLABS_API_KEY"],["speech","transcription"]],
  ["github","developer-platform","https://api.github.com",["GITHUB_TOKEN"],["repositories","pull-requests","actions"]],
  ["docker-hub","registry","https://hub.docker.com/v2",["DOCKERHUB_TOKEN"],["container-registry"]],
  ["huggingface","model-registry","https://huggingface.co/api",["HUGGINGFACE_TOKEN"],["models","datasets"]],
  ["pypi","package-registry","https://pypi.org/pypi",[],["package-metadata"]],
  ["npm","package-registry","https://registry.npmjs.org",[],["package-metadata"]],
  ["deno","runtime-registry","https://api.deno.land",[],["module-registry"]],
  ["nvidia-developer","developer-platform","https://developer.nvidia.com",[],["documentation"]],
  ["immunefi","security","https://immunefi.com",[],["security-programs"]],
  ["chainlink","oracle","https://chain.link",[],["oracle-documentation"]],
  ["sentry","observability","https://sentry.io/api/0",["SENTRY_AUTH_TOKEN","SENTRY_ORG"],["errors","performance"]],
  ["qdrant-cloud","vector","https://cloud.qdrant.io",["QDRANT_CLOUD_API_KEY"],["cluster-management"]],
  ["pinecone-control-plane","vector","https://api.pinecone.io",["PINECONE_API_KEY"],["index-management"]],
  ["openrouter","llm-gateway","https://openrouter.ai/api/v1",["OPENROUTER_API_KEY"],["model-routing"]]
].map(([id, category, baseUrl, requiredBindings, capabilities]) => Object.freeze({
  id, category, baseUrl, requiredBindings: Object.freeze(requiredBindings),
  capabilities: Object.freeze(capabilities)
})));

export class UniversalToolRegistryError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "UniversalToolRegistryError";
    this.code = code;
    this.status = status;
  }
}

function bindingPresent(env, key) {
  return typeof env?.[key] === "string" && env[key].trim().length > 0;
}

function statusFor(provider, env = {}) {
  const missingBindings = provider.requiredBindings.filter(key => !bindingPresent(env, key));
  const configured = missingBindings.length === 0;
  return {
    id: provider.id,
    category: provider.category,
    baseUrl: provider.baseUrl,
    capabilities: [...provider.capabilities],
    requiredBindings: [...provider.requiredBindings],
    missingBindings,
    configured,
    status: configured ? (provider.requiredBindings.length ? "configured_not_verified" : "public_metadata_only") : "not_configured",
    liveVerified: false,
    authenticated: false,
    connectionAttempted: false
  };
}

export function listUniversalTools(env = {}) {
  return PROVIDERS.map(provider => statusFor(provider, env));
}

export function getUniversalToolStatus(providerId, env = {}) {
  if (typeof providerId !== "string" || !/^[a-z0-9-]{1,64}$/.test(providerId)) {
    throw new UniversalToolRegistryError("UNKNOWN_TOOL_PROVIDER");
  }
  const provider = PROVIDERS.find(item => item.id === providerId);
  if (!provider) throw new UniversalToolRegistryError("UNKNOWN_TOOL_PROVIDER");
  return statusFor(provider, env);
}

export function getUniversalToolCatalog() {
  return PROVIDERS.map(({ id, category, baseUrl, requiredBindings, capabilities }) => ({
    id, category, baseUrl, requiredBindings: [...requiredBindings], capabilities: [...capabilities]
  }));
}
