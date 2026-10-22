/**
 * Treasury ledger API primitives. External payment execution is intentionally absent.
 * Persistence is append-only at the application layer; DB unique keys provide idempotency.
 */
const MAX_EVENT_MINOR = 1000;
const MAX_DAILY_MINOR = 5000;
const KEY_RE = /^[a-zA-Z0-9._:-]{1,100}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_ADDRESS_RE = /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const TEST_BTC_ADDRESS_RE = /^(tb1[ac-hj-np-z02-9]{11,71}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const LIGHTNING_INVOICE_RE = /^ln(bc|tb|bcrt)[0-9a-z]{20,}$/i;

export class TreasuryError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "TreasuryError";
    this.code = code;
    this.status = status;
  }
}

export async function ensureTreasurySchema(DB) {
  if (!DB?.prepare) throw new TreasuryError("TREASURY_DATABASE_UNAVAILABLE", 503);
  await DB.prepare(`CREATE TABLE IF NOT EXISTS treasury_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL CHECK(source IN ('bitcoin','lightning','web3','compute')),
    event_type TEXT NOT NULL CHECK(event_type IN ('scan','payment_intent','liquidity_event','compute_funding_intent')),
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0 AND amount_minor <= 1000),
    currency TEXT NOT NULL CHECK(currency IN ('SAT','USD_MINOR','TOKEN_MINOR')),
    network TEXT NOT NULL,
    destination_fingerprint TEXT,
    status TEXT NOT NULL CHECK(status IN ('simulated','rejected')),
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_treasury_events_created_at ON treasury_events(created_at)").run();
  await DB.prepare(`CREATE TRIGGER IF NOT EXISTS treasury_daily_cap_guard
    BEFORE INSERT ON treasury_events
    WHEN COALESCE((SELECT SUM(amount_minor) FROM treasury_events
      WHERE status = 'simulated' AND currency = NEW.currency AND created_at >= datetime('now', '-1 day')), 0) + NEW.amount_minor > 5000
    BEGIN SELECT RAISE(ABORT, 'TREASURY_DAILY_SPENDING_CAP_EXCEEDED'); END`).run();
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TreasuryError("TREASURY_EVENT_INVALID");
  if (input.livePayment === true || input.executeOnChain === true || input.broadcastTransaction === true) {
    throw new TreasuryError("TREASURY_LIVE_TRANSFERS_DISABLED", 403);
  }
  if (typeof input.idempotencyKey !== "string" || !KEY_RE.test(input.idempotencyKey)) throw new TreasuryError("TREASURY_IDEMPOTENCY_KEY_REQUIRED");
  if (!["bitcoin","lightning","web3","compute"].includes(input.source)) throw new TreasuryError("TREASURY_SOURCE_INVALID");
  if (!["scan","payment_intent","liquidity_event","compute_funding_intent"].includes(input.eventType)) throw new TreasuryError("TREASURY_EVENT_TYPE_INVALID");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > MAX_EVENT_MINOR) throw new TreasuryError("TREASURY_EVENT_SPEND_CAP_EXCEEDED", 403);
  const expectedCurrency = input.source === "bitcoin" || input.source === "lightning" ? "SAT" : input.source === "compute" ? "USD_MINOR" : "TOKEN_MINOR";
  if (input.currency !== expectedCurrency) throw new TreasuryError("TREASURY_CURRENCY_SOURCE_MISMATCH");
  if (typeof input.network !== "string" || !/^(simulation|bitcoin-testnet|lightning-testnet|sepolia|amoy|base-sepolia)$/.test(input.network)) throw new TreasuryError("TREASURY_NETWORK_NOT_ALLOWED", 403);
  if (input.source === "bitcoin") {
    if (input.network === "simulation") {
      if (input.destination !== undefined && typeof input.destination !== "string") throw new TreasuryError("TREASURY_DESTINATION_INVALID");
    } else if (input.network === "bitcoin-testnet" && input.destination && !TEST_BTC_ADDRESS_RE.test(input.destination)) throw new TreasuryError("TREASURY_DESTINATION_INVALID");
    else if (input.network !== "bitcoin-testnet" && input.network !== "simulation") throw new TreasuryError("TREASURY_NETWORK_NOT_ALLOWED", 403);
  }
  if (input.source === "lightning" && input.destination && input.network !== "simulation" && !LIGHTNING_INVOICE_RE.test(input.destination)) throw new TreasuryError("TREASURY_LIGHTNING_INVOICE_INVALID");
  if (input.source === "web3") {
    if (!["sepolia","amoy","base-sepolia","simulation"].includes(input.network)) throw new TreasuryError("TREASURY_NETWORK_NOT_ALLOWED", 403);
    if (typeof input.contractAddress !== "string" || !EVM_ADDRESS_RE.test(input.contractAddress)) throw new TreasuryError("TREASURY_CONTRACT_ADDRESS_INVALID");
  }
  if (input.source === "compute" && input.eventType !== "compute_funding_intent") throw new TreasuryError("TREASURY_COMPUTE_EVENT_INVALID");
  if (input.eventType === "payment_intent" && input.manualApproval !== true) throw new TreasuryError("TREASURY_MANUAL_APPROVAL_REQUIRED", 403);
  return {
    idempotencyKey: input.idempotencyKey,
    source: input.source,
    eventType: input.eventType,
    amountMinor: input.amountMinor,
    currency: expectedCurrency,
    network: input.network,
    destinationFingerprint: null,
    status: "simulated",
    details: { simulationOnly: true, externalTransferExecuted: false, livePaymentsEnabled: false }
  };
}

export async function appendTreasuryEvent(DB, input) {
  await ensureTreasurySchema(DB);
  const event = validateInput(input);
  const totals = await DB.prepare("SELECT COALESCE(SUM(amount_minor), 0) AS total FROM treasury_events WHERE status = 'simulated' AND currency = ? AND created_at >= datetime('now', '-1 day')").bind(event.currency).first();
  const total = Number(totals?.total || 0);
  if (!Number.isSafeInteger(total) || total + event.amountMinor > MAX_DAILY_MINOR) throw new TreasuryError("TREASURY_DAILY_SPENDING_CAP_EXCEEDED", 403);
  let result;
  try { result = await DB.prepare(`INSERT OR IGNORE INTO treasury_events
    (idempotency_key, source, event_type, amount_minor, currency, network, destination_fingerprint, status, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(event.idempotencyKey, event.source, event.eventType, event.amountMinor, event.currency, event.network, event.destinationFingerprint, event.status, JSON.stringify(event.details))
    .run(); } catch (error) {
    if (String(error?.message || error).includes("TREASURY_DAILY_SPENDING_CAP_EXCEEDED")) {
      throw new TreasuryError("TREASURY_DAILY_SPENDING_CAP_EXCEEDED", 403);
    }
    throw new TreasuryError("TREASURY_LEDGER_WRITE_FAILED", 503);
  }
  const changes = Number(result?.meta?.changes || 0);
  if (changes !== 1) throw new TreasuryError("TREASURY_DUPLICATE_IDEMPOTENCY_KEY", 409);
  return { ok: true, event: { ...event, id: result?.meta?.last_row_id ?? null }, ledgerMode: "simulation-only" };
}

export async function listTreasuryEvents(DB, limit = 20) {
  await ensureTreasurySchema(DB);
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 20;
  const result = await DB.prepare(`SELECT id, idempotency_key AS idempotencyKey, source, event_type AS eventType,
    amount_minor AS amountMinor, currency, network, destination_fingerprint AS destinationFingerprint,
    status, details_json AS detailsJson, created_at AS createdAt
    FROM treasury_events ORDER BY id DESC LIMIT ?`).bind(safeLimit).all();
  return (result?.results || []).map(row => ({
    ...row,
    details: (() => { try { return JSON.parse(row.detailsJson); } catch { return { simulationOnly: true }; } })(),
    detailsJson: undefined
  }));
}
