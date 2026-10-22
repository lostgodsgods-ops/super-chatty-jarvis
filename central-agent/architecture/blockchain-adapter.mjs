/**
 * REDULTRON blockchain adapter — simulation/testnet policy boundary.
 * This module does not sign, broadcast, or move real funds.
 */
const TESTNET_CHAIN_IDS = new Set([11155111, 80002, 84532]);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const KEY_RE = /^[a-zA-Z0-9._:-]{1,100}$/;

export class BlockchainAdapterError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "BlockchainAdapterError";
    this.code = code;
    this.status = status;
  }
}

export function createBlockchainAdapter({
  mode = "simulation",
  chainId = 11155111,
  maxSpendMinor = 1000,
  maxEventMinor = 250
} = {}) {
  if (mode !== "simulation" && mode !== "testnet") {
    throw new BlockchainAdapterError("BLOCKCHAIN_LIVE_MODE_DISABLED", 403);
  }
  if (!Number.isSafeInteger(chainId) || !TESTNET_CHAIN_IDS.has(chainId)) {
    throw new BlockchainAdapterError("BLOCKCHAIN_CHAIN_NOT_ALLOWED", 403);
  }
  if (!Number.isSafeInteger(maxSpendMinor) || maxSpendMinor < 0 ||
      !Number.isSafeInteger(maxEventMinor) || maxEventMinor < 0 ||
      maxEventMinor > maxSpendMinor) {
    throw new BlockchainAdapterError("BLOCKCHAIN_SPENDING_LIMIT_INVALID", 400);
  }
  return Object.freeze({
    mode,
    chainId,
    maxSpendMinor,
    maxEventMinor,
    liveTransfersEnabled: false,
    contractAddressPattern: ADDRESS_RE.source
  });
}

export function validateContractAddress(address) {
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    throw new BlockchainAdapterError("BLOCKCHAIN_CONTRACT_ADDRESS_INVALID", 400);
  }
  return address;
}

/**
 * Validate an event and produce a simulated ledger decision.
 * The caller must enforce owner authorization before invoking this function.
 */
export function handleContractEvent(adapter, ledger, event, { authorized = false } = {}) {
  const deny = code => ({ ok: false, code, ledger });
  if (!adapter || !["simulation", "testnet"].includes(adapter.mode) ||
      adapter.liveTransfersEnabled !== false) return deny("BLOCKCHAIN_ADAPTER_INVALID");
  if (authorized !== true) return deny("OWNER_AUTH_REQUIRED");
  if (!ledger || !Number.isSafeInteger(ledger.spentMinor) ||
      ledger.spentMinor < 0 || !(ledger.idempotencyKeys instanceof Set)) {
    return deny("BLOCKCHAIN_LEDGER_INVALID");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) return deny("BLOCKCHAIN_EVENT_INVALID");
  try { validateContractAddress(event.contractAddress); } catch (error) { return deny(error.code); }
  if (event.chainId !== adapter.chainId) return deny("BLOCKCHAIN_CHAIN_MISMATCH");
  if (typeof event.idempotencyKey !== "string" || !KEY_RE.test(event.idempotencyKey)) {
    return deny("BLOCKCHAIN_IDEMPOTENCY_KEY_REQUIRED");
  }
  if (ledger.idempotencyKeys.has(event.idempotencyKey)) return deny("BLOCKCHAIN_DUPLICATE_EVENT");
  if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor <= 0 ||
      event.amountMinor > adapter.maxEventMinor) return deny("BLOCKCHAIN_EVENT_LIMIT_EXCEEDED");
  const nextSpent = ledger.spentMinor + event.amountMinor;
  if (!Number.isSafeInteger(nextSpent) || nextSpent > adapter.maxSpendMinor) {
    return deny("BLOCKCHAIN_SPENDING_CAP_EXCEEDED");
  }
  const nextKeys = new Set(ledger.idempotencyKeys);
  nextKeys.add(event.idempotencyKey);
  return {
    ok: true,
    mode: adapter.mode,
    simulated: true,
    liveTransfer: false,
    transaction: {
      chainId: adapter.chainId,
      contractAddress: event.contractAddress,
      idempotencyKey: event.idempotencyKey,
      amountMinor: event.amountMinor
    },
    ledger: { spentMinor: nextSpent, idempotencyKeys: nextKeys }
  };
}
