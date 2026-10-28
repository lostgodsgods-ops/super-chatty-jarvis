/**
 * Bounded server-side chat adapters for selected external model providers.
 * Endpoints are fixed per provider; callers cannot supply arbitrary URLs.
 * Credentials are read only from Worker environment bindings.
 */
const TIMEOUT_MS = 8000;
const MAX_PROMPT_CHARS = 12000;
const MAX_TOKENS = 1024;
const PROVIDERS = Object.freeze({
  openai: { env: "OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/chat/completions", format: "openai", defaultModel: "gpt-4o-mini" },
  deepseek: { env: "DEEPSEEK_API_KEY", endpoint: "https://api.deepseek.com/chat/completions", format: "openai", defaultModel: "deepseek-chat" },
  groq: { env: "GROQ_API_KEY", endpoint: "https://api.groq.com/openai/v1/chat/completions", format: "openai", defaultModel: "llama-3.3-70b-versatile" },
  mistral: { env: "MISTRAL_API_KEY", endpoint: "https://api.mistral.ai/v1/chat/completions", format: "openai", defaultModel: "mistral-small-latest" },
  "together-ai": { env: "TOGETHER_API_KEY", endpoint: "https://api.together.xyz/v1/chat/completions", format: "openai", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  "fireworks-ai": { env: "FIREWORKS_API_KEY", endpoint: "https://api.fireworks.ai/inference/v1/chat/completions", format: "openai", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  openrouter: { env: "OPENROUTER_API_KEY", endpoint: "https://openrouter.ai/api/v1/chat/completions", format: "openai", defaultModel: "openai/gpt-4o-mini" },
  claude: { env: "ANTHROPIC_API_KEY", endpoint: "https://api.anthropic.com/v1/messages", format: "anthropic", defaultModel: "claude-3-5-haiku-latest" },
  gemini: { env: "GEMINI_API_KEY", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", format: "gemini", defaultModel: "gemini-2.5-flash" }
});
export class ChatProviderError extends Error {
  constructor(code, status = 503) { super(code); this.name = "ChatProviderError"; this.code = code; this.status = status; }
}
export function listChatProviders(env = {}) {
  return Object.entries(PROVIDERS).map(([id, provider]) => {
    const configured = typeof env[provider.env] === "string" && env[provider.env].trim().length > 0;
    return { id, configured, status: configured ? "configured_not_verified" : "not_configured", liveVerified: false, requiredBinding: provider.env };
  });
}
function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ChatProviderError("INVALID_INPUT", 400);
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new ChatProviderError("INVALID_PROMPT", 400);
  if (input.prompt.length > MAX_PROMPT_CHARS) throw new ChatProviderError("PROMPT_TOO_LARGE", 413);
  if (input.model !== undefined && (typeof input.model !== "string" || !/^[A-Za-z0-9._:/-]{1,160}$/.test(input.model))) throw new ChatProviderError("INVALID_MODEL", 400);
  const maxTokens = input.maxTokens === undefined ? 512 : input.maxTokens;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS) throw new ChatProviderError("INVALID_MAX_TOKENS", 400);
  return { prompt: input.prompt.trim(), model: input.model, maxTokens };
}
function responseText(payload, format) {
  if (format === "openai") return payload?.choices?.[0]?.message?.content;
  if (format === "anthropic") return Array.isArray(payload?.content) ? payload.content.filter(x => x?.type === "text").map(x => x.text).join("\n") : null;
  if (format === "gemini") return payload?.candidates?.[0]?.content?.parts?.filter(x => typeof x?.text === "string").map(x => x.text).join("\n");
  return null;
}
export async function executeChatCompletion(input, env = {}, fetchImpl = globalThis.fetch) {
  const validated = validateInput(input);
  const provider = PROVIDERS[input.provider];
  if (!provider) throw new ChatProviderError("UNKNOWN_PROVIDER", 400);
  const key = env[provider.env];
  if (typeof key !== "string" || !key.trim()) throw new ChatProviderError("PROVIDER_NOT_CONFIGURED", 503);
  if (typeof fetchImpl !== "function") throw new ChatProviderError("FETCH_UNAVAILABLE", 503);
  const model = validated.model || provider.defaultModel;
  let endpoint = provider.endpoint;
  const headers = { "content-type": "application/json", accept: "application/json" };
  let body;
  if (provider.format === "openai") {
    headers.authorization = "Bearer " + key.trim();
    body = { model, messages: [{ role: "user", content: validated.prompt }], max_tokens: validated.maxTokens, stream: false };
  } else if (provider.format === "anthropic") {
    headers["x-api-key"] = key.trim();
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: validated.maxTokens, messages: [{ role: "user", content: validated.prompt }] };
  } else {
    endpoint += "/" + encodeURIComponent(model) + ":generateContent";
    headers["x-goog-api-key"] = key.trim();
    body = { contents: [{ role: "user", parts: [{ text: validated.prompt }] }], generationConfig: { maxOutputTokens: validated.maxTokens } };
  }
  let response;
  try {
    response = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  } catch (error) {
    throw new ChatProviderError(error?.name === "TimeoutError" || error?.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", 502);
  }
  if (!response.ok) throw new ChatProviderError("PROVIDER_HTTP_" + response.status, 502);
  let raw;
  try { raw = await response.text(); } catch { throw new ChatProviderError("INVALID_PROVIDER_RESPONSE", 502); }
  if (raw.length > 1_000_000) throw new ChatProviderError("PROVIDER_RESPONSE_TOO_LARGE", 502);
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { throw new ChatProviderError("INVALID_PROVIDER_RESPONSE", 502); }
  const text = responseText(payload, provider.format);
  if (typeof text !== "string" || !text.trim()) throw new ChatProviderError("EMPTY_PROVIDER_RESPONSE", 502);
  return { ok: true, provider: input.provider, model, text: text.slice(0, 20000), maxTokens: validated.maxTokens };
}
