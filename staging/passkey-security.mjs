const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SESSION_TTL_SECONDS = 60 * 60;

export function isAllowedOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"));
  } catch {
    return false;
  }
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function derEcdsaToRaw(signature, width = 32) {
  // WebAuthn ES256 signatures are ASN.1 DER; WebCrypto ECDSA expects fixed-width r||s.
  if (signature.length === width * 2) return signature;
  if (signature[0] !== 0x30) throw new Error("Invalid ECDSA signature encoding");
  let offset = 1;
  let sequenceLength = signature[offset++];
  if (sequenceLength & 0x80) {
    const count = sequenceLength & 0x7f;
    if (count < 1 || count > 2) throw new Error("Invalid DER length");
    sequenceLength = 0;
    for (let i = 0; i < count; i++) sequenceLength = (sequenceLength << 8) | signature[offset++];
  }
  if (offset + sequenceLength !== signature.length || signature[offset++] !== 0x02) throw new Error("Invalid DER sequence");
  const rLength = signature[offset++];
  const r = signature.slice(offset, offset + rLength); offset += rLength;
  if (signature[offset++] !== 0x02) throw new Error("Invalid DER integer");
  const sLength = signature[offset++];
  const s = signature.slice(offset, offset + sLength); offset += sLength;
  if (offset !== signature.length) throw new Error("Trailing DER data");
  const trim = (v) => v.length > 1 && v[0] === 0 ? v.slice(1) : v;
  const rr = trim(r), ss = trim(s);
  if (rr.length > width || ss.length > width) throw new Error("ECDSA integer out of range");
  const raw = new Uint8Array(width * 2);
  raw.set(rr, width - rr.length);
  raw.set(ss, width * 2 - ss.length);
  return raw;
}

/**
 * Verifies a WebAuthn assertion against a previously validated credential public key.
 * Registration/attestation validation must happen before storing this public key.
 */
export async function verifyAssertion({ assertion, publicKey, expected, requireUserVerification = true }) {
  if (!assertion || !expected || !publicKey) throw new Error("Missing assertion verification input");
  if (!isAllowedOrigin(expected.origin)) throw new Error("Configured origin must be HTTPS (or localhost for development)");

  const clientDataBytes = decodeBase64Url(assertion.clientDataJSON);
  const clientData = JSON.parse(decoder.decode(clientDataBytes));
  if (clientData.type !== "webauthn.get") throw new Error("Unexpected WebAuthn ceremony type");
  if (clientData.crossOrigin === true) throw new Error("Cross-origin WebAuthn assertions are not allowed");
  if (clientData.origin !== expected.origin) throw new Error("WebAuthn origin mismatch");
  if (clientData.challenge !== expected.challenge) throw new Error("WebAuthn challenge mismatch");

  const authData = decodeBase64Url(assertion.authenticatorData);
  if (authData.length < 37) throw new Error("Authenticator data is too short");
  const expectedRpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected.rpId)));
  if (!equalBytes(authData.slice(0, 32), expectedRpHash)) throw new Error("Relying party ID hash mismatch");

  const flags = authData[32];
  if ((flags & 0x01) === 0) throw new Error("User presence flag is missing");
  if (requireUserVerification && (flags & 0x04) === 0) throw new Error("User verification flag is missing");

  const spki = decodeBase64Url(publicKey);
  const importedKey = await crypto.subtle.importKey(
    "spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
  );
  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataBytes));
  const signedData = new Uint8Array(authData.length + clientHash.length);
  signedData.set(authData, 0);
  signedData.set(clientHash, authData.length);
  const signature = derEcdsaToRaw(decodeBase64Url(assertion.signature));
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, importedKey, signature, signedData);
  if (!valid) throw new Error("WebAuthn signature verification failed");
  return true;
}
