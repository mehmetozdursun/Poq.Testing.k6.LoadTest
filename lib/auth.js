// Auth helpers shared by clients. Guest-token calls live in lib/platform/account.js; client-specific
// login flows (e.g. TWC storefront OAuth) live in clients/<client>/endpoints.js.

import { sha256, hmac } from 'k6/crypto';
import encoding from 'k6/encoding';

// OAuth2 PKCE pair (RFC 7636, S256): 32 random bytes → base64url verifier; challenge = base64url(SHA-256(verifier)).
export function pkcePair() {
  const verifier = encoding.b64encode(crypto.getRandomValues(new Uint8Array(32)).buffer, 'rawurl');
  return { verifier, challenge: sha256(verifier, 'base64rawurl') };
}

// ---- poq-auth request signing (Hot Topic, Elf, Hobbycraft) ----
// key = PBKDF2-HMAC-SHA256(secretKey, salt, 1000 iterations, 256 bits)          — once, in setup()
// poq-auth = Base64(HMAC-SHA256(key, compactBody + poqUserId))                   — per request
// Same algorithm as the JMeter JSR223 "encoded_key" scripts. compactBody drops the whitespace
// between JSON tokens but keeps it inside string values: the Hot Topic app 26.2.0 signs
// "3485 29th St" with its spaces (checked against 22 captured prod calls, 2026-10-01). A bodyless
// request signs just the poq-user-id.

export async function derivePoqAuthKey(secretKey, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 1000 }, base, 256);
  return encoding.b64encode(bits); // base64, so it can travel in setup() data
}

export function poqAuth(keyB64, body, poqUserId) {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return hmac('sha256', encoding.b64decode(keyB64), compactJson(text) + poqUserId, 'base64');
}

// Removes whitespace outside JSON string values.
export function compactJson(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}
