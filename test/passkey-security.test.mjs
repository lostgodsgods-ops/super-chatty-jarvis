import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyAssertion, isAllowedOrigin, SESSION_TTL_SECONDS } from "../staging/passkey-security.mjs";

const enc = (value) => Buffer.from(value).toString("base64url");
const utf8 = (value) => new TextEncoder().encode(value);

async function makeAssertion({ origin = "https://super-chatty-jarvis-site.pages.dev", challenge = "fresh-challenge", rpId = "super-chatty-jarvis-site.pages.dev", uv = true } = {}) {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await webcrypto.subtle.exportKey("spki", pair.publicKey));
  const clientDataJSON = utf8(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(new Uint8Array(await webcrypto.subtle.digest("SHA-256", utf8(rpId))), 0);
  authenticatorData[32] = uv ? 0x05 : 0x01; // user present; UV optional
  const clientHash = new Uint8Array(await webcrypto.subtle.digest("SHA-256", clientDataJSON));
  const signed = new Uint8Array(authenticatorData.length + clientHash.length);
  signed.set(authenticatorData, 0);
  signed.set(clientHash, authenticatorData.length);
  const signature = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signed));
  return {
    assertion: { clientDataJSON: enc(clientDataJSON), authenticatorData: enc(authenticatorData), signature: enc(signature) },
    publicKey: enc(publicKey),
    expected: { challenge, origin, rpId }
  };
}

test("secure origins allow HTTPS and localhost only", () => {
  assert.equal(isAllowedOrigin("https://example.com"), true);
  assert.equal(isAllowedOrigin("http://localhost:8787"), true);
  assert.equal(isAllowedOrigin("http://example.com"), false);
  assert.equal(isAllowedOrigin("https://example.com.evil.test"), true); // valid HTTPS origin; exact match is enforced separately
  assert.equal(SESSION_TTL_SECONDS, 3600);
});

test("valid assertion verifies against challenge, origin, RP ID, and public key", async () => {
  const item = await makeAssertion();
  assert.equal(await verifyAssertion({ ...item, requireUserVerification: true }), true);
});

test("rejects an unexpected origin", async () => {
  const item = await makeAssertion();
  await assert.rejects(verifyAssertion({ ...item, expected: { ...item.expected, origin: "https://attacker.example" }, requireUserVerification: true }));
});

test("rejects a replayed or mismatched challenge", async () => {
  const item = await makeAssertion();
  await assert.rejects(verifyAssertion({ ...item, expected: { ...item.expected, challenge: "already-used" }, requireUserVerification: true }));
});

test("rejects an RP ID hash mismatch", async () => {
  const item = await makeAssertion();
  await assert.rejects(verifyAssertion({ ...item, expected: { ...item.expected, rpId: "attacker.example" }, requireUserVerification: true }));
});

test("rejects assertions without user verification when required", async () => {
  const item = await makeAssertion({ uv: false });
  await assert.rejects(verifyAssertion({ ...item, requireUserVerification: true }));
});
