const encoder = new TextEncoder();

export function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
function concat(...parts) {
  const length = parts.reduce((n, part) => n + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function equalBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function decodeCbor(bytes, start = 0) {
  let offset = start;
  const readLength = additional => {
    if (additional < 24) return additional;
    const sizes = { 24: 1, 25: 2, 26: 4, 27: 8 };
    const size = sizes[additional];
    if (!size || offset + size > bytes.length) throw new Error("Invalid CBOR length");
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + bytes[offset++];
    if (!Number.isSafeInteger(value)) throw new Error("CBOR integer too large");
    return value;
  };
  const first = bytes[offset++];
  if (first === undefined) throw new Error("Truncated CBOR");
  const major = first >> 5, additional = first & 31;
  if (major === 7) {
    if (additional === 20) return { value: false, offset };
    if (additional === 21) return { value: true, offset };
    if (additional === 22) return { value: null, offset };
    throw new Error("Unsupported CBOR simple value");
  }
  const length = readLength(additional);
  if (major === 0) return { value: length, offset };
  if (major === 1) return { value: -1 - length, offset };
  if (major === 2 || major === 3) {
    if (offset + length > bytes.length) throw new Error("Truncated CBOR bytes");
    const data = bytes.slice(offset, offset + length); offset += length;
    return { value: major === 2 ? data : new TextDecoder().decode(data), offset };
  }
  if (major === 4) {
    const items = [];
    for (let i = 0; i < length; i++) { const item = decodeCbor(bytes, offset); items.push(item.value); offset = item.offset; }
    return { value: items, offset };
  }
  if (major === 5) {
    const map = new Map();
    for (let i = 0; i < length; i++) {
      const key = decodeCbor(bytes, offset); offset = key.offset;
      const val = decodeCbor(bytes, offset); offset = val.offset;
      map.set(key.value instanceof Uint8Array ? base64url(key.value) : key.value, val.value);
    }
    return { value: map, offset };
  }
  throw new Error("Unsupported CBOR type");
}
function clientData(jsonBytes, expectedType, expectedChallenge, expectedOrigin) {
  let data;
  try { data = JSON.parse(new TextDecoder().decode(jsonBytes)); } catch { throw new Error("Invalid WebAuthn client data"); }
  if (data.type !== expectedType || data.challenge !== expectedChallenge || data.origin !== expectedOrigin || data.crossOrigin === true) {
    throw new Error("WebAuthn origin, challenge, or ceremony mismatch");
  }
  return crypto.subtle.digest("SHA-256", jsonBytes).then(hash => ({ data, hash: new Uint8Array(hash) }));
}
async function verifyRpAndFlags(authData, rpId, requireAttested) {
  if (authData.length < 37) throw new Error("Authenticator data is truncated");
  const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(rpId)));
  if (!equalBytes(authData.slice(0, 32), rpHash)) throw new Error("Relying-party ID mismatch");
  const flags = authData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new Error("Device user presence and verification are required");
  if (requireAttested && !(flags & 0x40)) throw new Error("Attested credential data is missing");
  return { flags, counter: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) };
}
export async function verifyRegistration(body, expectedChallenge, expectedOrigin, rpId) {
  const response = body?.response;
  if (!response?.clientDataJSON || !response?.attestationObject || body.type !== "public-key") throw new Error("Malformed passkey registration");
  const clientBytes = fromBase64url(response.clientDataJSON);
  await clientData(clientBytes, "webauthn.create", expectedChallenge, expectedOrigin);
  const attestation = decodeCbor(fromBase64url(response.attestationObject)).value;
  if (!(attestation instanceof Map) || attestation.get("fmt") !== "none" || !(attestation.get("authData") instanceof Uint8Array)) {
    throw new Error("This passkey attestation format is not supported; try the device's platform passkey flow");
  }
  const authData = attestation.get("authData");
  await verifyRpAndFlags(authData, rpId, true);
  if (authData.length < 55) throw new Error("Attested credential data is truncated");
  const credentialLength = (authData[53] << 8) | authData[54];
  const idStart = 55, keyStart = idStart + credentialLength;
  if (!credentialLength || keyStart >= authData.length) throw new Error("Credential ID is missing");
  const credentialId = authData.slice(idStart, keyStart);
  const parsedCredentialId = base64url(credentialId);
  const submittedCredentialId = typeof body.rawId === "string" ? body.rawId : (typeof body.id === "string" ? body.id : "");
  if (!submittedCredentialId || submittedCredentialId !== parsedCredentialId) {
    throw new Error("Submitted credential ID does not match attested credential ID");
  }
  const cose = decodeCbor(authData, keyStart).value;
  if (!(cose instanceof Map) || cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1 ||
      !(cose.get(-2) instanceof Uint8Array) || !(cose.get(-3) instanceof Uint8Array)) {
    throw new Error("Passkey must use an ES256 P-256 public key");
  }
  return {
    credentialId: base64url(credentialId),
    publicKey: { kty: "EC", crv: "P-256", x: base64url(cose.get(-2)), y: base64url(cose.get(-3)), ext: true },
    signCount: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0)
  };
}
export async function verifyAssertion(body, expectedChallenge, expectedOrigin, rpId, stored) {
  const response = body?.response;
  if (!response?.clientDataJSON || !response?.authenticatorData || !response?.signature || body.type !== "public-key") throw new Error("Malformed passkey assertion");
  const credentialId = body.rawId || body.id;
  if (credentialId !== stored.credential_id) throw new Error("Unknown passkey credential");
  const clientBytes = fromBase64url(response.clientDataJSON);
  const { hash: clientHash } = await clientData(clientBytes, "webauthn.get", expectedChallenge, expectedOrigin);
  const authData = fromBase64url(response.authenticatorData);
  const { counter } = await verifyRpAndFlags(authData, rpId, false);
  if (stored.sign_count > 0 && counter > 0 && counter <= stored.sign_count) throw new Error("Passkey signature counter did not advance");
  const signedBytes = concat(authData, clientHash);
  const key = await crypto.subtle.importKey("jwk", JSON.parse(stored.public_key_json), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64url(response.signature), signedBytes);
  if (!valid) throw new Error("Passkey signature verification failed");
  return { credentialId, signCount: counter };
}
export function randomChallenge() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
