/**
 * Provider capability registry for Central Agent.
 * Registry entries describe integration readiness; they do not imply credentials or
 * provider availability. Only the Workers AI and Tavily adapters are implemented
 * by the current Worker routes.
 */
const PROVIDERS = Object.freeze({
  "workers-ai": { families: ["llm", "slm"], transport: "cloudflare-ai-binding", implemented: true, env: "AI" },
  "tavily": { families: ["search"], transport: "https", implemented: true, env: "SEARCH_API_KEY" },
  "openai": { families: ["llm", "vlm"], transport: "https", implemented: true, env: "OPENAI_API_KEY" },
  "claude": { families: ["llm", "vlm"], transport: "https", implemented: true, env: "ANTHROPIC_API_KEY" },
  "gemini": { families: ["llm", "vlm"], transport: "https", implemented: true, env: "GEMINI_API_KEY" },
  "deepseek": { families: ["llm"], transport: "https", implemented: true, env: "DEEPSEEK_API_KEY" },
  "groq": { families: ["llm", "slm"], transport: "https", implemented: true, env: "GROQ_API_KEY" },
  "mistral": { families: ["llm", "slm"], transport: "https", implemented: true, env: "MISTRAL_API_KEY" },
  "together-ai": { families: ["llm"], transport: "https", implemented: true, env: "TOGETHER_API_KEY" },
  "fireworks-ai": { families: ["llm"], transport: "https", implemented: true, env: "FIREWORKS_API_KEY" },
  "openrouter": { families: ["llm"], transport: "https", implemented: true, env: "OPENROUTER_API_KEY" },
  "llama-hosted": { families: ["llm", "slm"], transport: "https", implemented: false, env: "LLAMA_API_KEY" },
  "lcm": { families: ["long-context-memory"], transport: "adapter", implemented: false, env: "LCM_ADAPTER" },
  "lam": { families: ["language-action-model"], transport: "adapter", implemented: false, env: "LAM_ADAPTER" },
  "moe": { families: ["mixture-of-experts"], transport: "adapter", implemented: false, env: "MOE_ADAPTER" },
  "mlm": { families: ["multilingual-model"], transport: "adapter", implemented: false, env: "MLM_ADAPTER" },
  "sam": { families: ["segmentation-model"], transport: "adapter", implemented: false, env: "SAM_ADAPTER" },
  "vlm": { families: ["vision-language-model"], transport: "adapter", implemented: false, env: "VLM_ADAPTER" }
});

export function listProviderCapabilities(env = {}) {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id, families: [...provider.families], transport: provider.transport,
    implemented: provider.implemented, configured: Boolean(provider.env && env[provider.env]),
    status: !provider.implemented ? "not_implemented" : !env[provider.env] ? "not_configured" : "configured_not_verified"
  }));
}
export function resolveProvider(providerId, env = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { ok: false, status: 400, code: "UNKNOWN_PROVIDER", error: "Unknown provider." };
  if (!provider.implemented) return { ok: false, status: 501, code: "PROVIDER_ADAPTER_NOT_IMPLEMENTED", error: "This provider is registered but its adapter is not implemented." };
  if (!env[provider.env]) return { ok: false, status: 503, code: "PROVIDER_NOT_CONFIGURED", error: "Provider binding or credential is not configured." };
  return { ok: true, provider: providerId, transport: provider.transport };
}
export const MODEL_FAMILIES = Object.freeze(["classical-ai", "llm", "lcm", "lam", "moe", "vlm", "slm", "mlm", "sam", "agentic-ai"]);
