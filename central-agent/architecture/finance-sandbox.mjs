/**
 * In-memory finance ledger for simulation and tests only.
 * It has no provider integration, no persistence, and cannot move real funds.
 */
export function createSandboxLedger({ balanceMinor = 0, maxBalanceMinor = 100_000_000 } = {}) {
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0 ||
      !Number.isSafeInteger(maxBalanceMinor) || maxBalanceMinor < balanceMinor || maxBalanceMinor < 0) {
    throw new TypeError("INVALID_SANDBOX_LEDGER_CONFIGURATION");
  }
  return {
    mode: "simulation-only",
    livePaymentsEnabled: false,
    balanceMinor,
    maxBalanceMinor,
    transactions: [],
    idempotencyKeys: []
  };
}

export function postSandboxTransaction(ledger, input = {}) {
  const deny = error => ({ ok: false, error, ledger });
  if (!ledger || ledger.mode !== "simulation-only" || ledger.livePaymentsEnabled !== false) {
    return deny("INVALID_SANDBOX_LEDGER");
  }
  if (input.livePayment === true) return deny("LIVE_PAYMENTS_DISABLED");
  if (typeof input.idempotencyKey !== "string" || !/^[a-zA-Z0-9._:-]{1,100}$/.test(input.idempotencyKey)) {
    return deny("IDEMPOTENCY_KEY_REQUIRED");
  }
  if (ledger.idempotencyKeys.includes(input.idempotencyKey)) return deny("DUPLICATE_IDEMPOTENCY_KEY");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return deny("INVALID_AMOUNT");
  if (input.kind !== "credit" && input.kind !== "debit") return deny("INVALID_TRANSACTION_KIND");
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 240)) return deny("INVALID_TRANSACTION_NOTE");

  const delta = input.kind === "credit" ? input.amountMinor : -input.amountMinor;
  const balanceMinor = ledger.balanceMinor + delta;
  if (!Number.isSafeInteger(balanceMinor)) return deny("BALANCE_OVERFLOW");
  if (balanceMinor < 0) return deny("INSUFFICIENT_SANDBOX_BALANCE");
  if (balanceMinor > ledger.maxBalanceMinor) return deny("SANDBOX_LIMIT_EXCEEDED");

  const transaction = Object.freeze({
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    amountMinor: input.amountMinor,
    balanceAfterMinor: balanceMinor,
    note: input.note?.trim() || "",
    createdAt: new Date().toISOString(),
    simulationOnly: true
  });
  const next = {
    ...ledger,
    balanceMinor,
    transactions: [...ledger.transactions, transaction],
    idempotencyKeys: [...ledger.idempotencyKeys, input.idempotencyKey]
  };
  return { ok: true, ledger: next, transaction };
}
