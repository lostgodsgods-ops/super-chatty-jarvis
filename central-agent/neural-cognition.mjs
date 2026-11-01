/**
 * Deterministic, bounded neural-inspired cognition graph for REDULTRON.
 * This is an interpretable activation/attention pipeline, not a trained
 * biological neural network or foundation model.
 */
export const COGNITIVE_NETWORK_VERSION = "1.0.0";
const MAX_GOAL_CHARS = 5000;
const MAX_EVIDENCE = 20;
const MAX_NODES = 12;
const TOKENS = /[a-z0-9_]{2,}/gi;

const NODE_DEFINITIONS = Object.freeze([
  { id: "perception", terms: ["input", "observe", "signal", "inspect", "understand"] },
  { id: "planning", terms: ["plan", "goal", "design", "sequence", "strategy"] },
  { id: "memory", terms: ["memory", "remember", "retrieve", "knowledge", "history"] },
  { id: "attention", terms: ["focus", "priority", "relevant", "rank", "attention"] },
  { id: "reasoning", terms: ["reason", "analyze", "debug", "infer", "solve"] },
  { id: "evaluation", terms: ["evaluate", "evidence", "verify", "test", "proof"] },
  { id: "learning", terms: ["learn", "improve", "feedback", "adapt", "review"] },
  { id: "orchestration", terms: ["agent", "orchestrate", "coordinate", "execute", "workflow"] },
  { id: "security", terms: ["secure", "policy", "permission", "auth", "secret"] },
  { id: "robotics", terms: ["robot", "actuator", "physical", "motion"] }
]);

const CONNECTIONS = Object.freeze([
  ["perception", "attention", 0.35], ["attention", "memory", 0.25],
  ["attention", "reasoning", 0.35], ["memory", "reasoning", 0.30],
  ["reasoning", "planning", 0.30], ["reasoning", "evaluation", 0.35],
  ["evaluation", "learning", 0.35], ["learning", "memory", 0.20],
  ["planning", "orchestration", 0.25], ["security", "orchestration", 0.20]
]);

function tokens(value) {
  return new Set((value.match(TOKENS) || []).map(token => token.toLowerCase()));
}
function clamp(value) {
  return Math.max(0, Math.min(1, value));
}
function trustedEvidence(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_EVIDENCE).filter(item =>
    item && typeof item === "object" && item.verified === true &&
    typeof item.reference === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,119}$/.test(item.reference)
  );
}

/**
 * Runs a small fixed activation graph. Activation is derived from input
 * relevance and bounded message passing; it does not update persistent weights.
 */
export function runCognitiveCycle(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof input.goal !== "string" || !input.goal.trim()) {
    const error = new Error("COGNITIVE_GOAL_REQUIRED");
    error.code = "COGNITIVE_GOAL_REQUIRED";
    throw error;
  }
  if (input.goal.length > MAX_GOAL_CHARS) {
    const error = new Error("COGNITIVE_INPUT_TOO_LARGE");
    error.code = "COGNITIVE_INPUT_TOO_LARGE";
    throw error;
  }

  const goalTokens = tokens(input.goal);
  const evidence = trustedEvidence(input.evidence);
  const evidenceTokens = tokens(evidence.map(item => item.summary || "").join(" "));
  const activations = new Map();

  for (const node of NODE_DEFINITIONS.slice(0, MAX_NODES)) {
    const matches = node.terms.filter(term => goalTokens.has(term)).length;
    const evidenceMatches = node.terms.filter(term => evidenceTokens.has(term)).length;
    const base = clamp((matches / Math.max(3, node.terms.length)) * 0.8 + (evidenceMatches ? 0.1 : 0));
    activations.set(node.id, base);
  }

  // Two bounded propagation passes; source activations are not mutated in place.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map(activations);
    for (const [from, to, weight] of CONNECTIONS) {
      const source = activations.get(from) || 0;
      next.set(to, clamp((next.get(to) || 0) + source * weight * 0.35));
    }
    for (const [id, value] of next) activations.set(id, value);
  }

  const nodes = NODE_DEFINITIONS.slice(0, MAX_NODES)
    .map(node => ({ id: node.id, activation: Math.round((activations.get(node.id) || 0) * 1000) / 1000 }))
    .sort((a, b) => b.activation - a.activation || a.id.localeCompare(b.id));

  return Object.freeze({
    identity: Object.freeze({ coreId: "redultron.core.primary", name: "REDULTRON" }),
    network: Object.freeze({
      version: COGNITIVE_NETWORK_VERSION,
      architecture: "bounded-directed-activation-graph",
      nodes,
      edges: CONNECTIONS.length,
      propagationPasses: 2,
      persistentWeightUpdates: false
    }),
    attention: Object.freeze({ prioritizedModules: nodes.slice(0, 4).map(node => node.id) }),
    evidence: Object.freeze({
      trustedCount: evidence.length,
      verification: evidence.length ? "VERIFIED_REFERENCES_PRESENT" : "UNVERIFIED"
    }),
    execution: Object.freeze({ toolsExecuted: false, externalSideEffects: false })
  });
}
