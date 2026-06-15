'use strict';

const crypto = require('crypto');

// Use byte length so multi-byte characters are handled correctly
function safeEqual(a, b) {
  const lenA = Buffer.byteLength(a);
  const lenB = Buffer.byteLength(b);
  const len = Math.max(lenA, lenB);
  const bufA = Buffer.alloc(len);
  const bufB = Buffer.alloc(len);
  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);
  return crypto.timingSafeEqual(bufA, bufB);
}

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function mintJWT(signingSecret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: 'codelegion', iat: now, exp: now + ttlSeconds }));
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${header}.${payload}.${signature}`;
}

// 1-127 chars, starts with alphanumeric, allows alphanumeric and hyphens.
function validateUsername(username) {
  if (typeof username !== 'string') return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9-]{0,126}$/.test(username);
}

// ── TOTP helpers ─────────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32encode(buf) {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return result;
}

function base32decode(str) {
  const s = str.toUpperCase().replace(/=+$/, '');
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character: ' + ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTOTPSecret() {
  return base32encode(crypto.randomBytes(20));
}

function hotp(base32Secret, counter) {
  const key = base32decode(base32Secret);
  const counterBuf = Buffer.alloc(8);
  const hi = Number(BigInt(counter) >> 32n);
  const lo = Number(BigInt(counter) & 0xffffffffn);
  counterBuf.writeUInt32BE(hi, 0);
  counterBuf.writeUInt32BE(lo, 4);
  const mac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = mac[19] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24)
    | (mac[offset + 1] << 16)
    | (mac[offset + 2] << 8)
    | mac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTOTP(base32Secret, userCode) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    if (hotp(base32Secret, counter + w) === userCode) return true;
  }
  return false;
}

// ── Pending (MFA) JWT helpers ─────────────────────────────────────────────────

const MFA_PENDING_SUB = 'codelegion:mfa-pending';

function mintPendingJWT(signingSecret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: MFA_PENDING_SUB, iat: now, exp: now + ttlSeconds }));
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${header}.${payload}.${signature}`;
}

// Returns parsed payload on success; throws a descriptive Error on failure.
function verifyJWT(signingSecret, token, expectedSub) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new Error('INVALID_TOKEN');
  const [header, payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  const len = Math.max(sigBuf.length, expBuf.length);
  const a = Buffer.alloc(len);
  const b = Buffer.alloc(len);
  sigBuf.copy(a);
  expBuf.copy(b);
  if (!crypto.timingSafeEqual(a, b)) throw new Error('INVALID_SIGNATURE');
  const pad = (s) => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - s.length % 4) % 4);
  const decoded = JSON.parse(Buffer.from(pad(payload), 'base64').toString('utf8'));
  if (decoded.sub !== expectedSub) throw new Error('WRONG_SUB');
  if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('TOKEN_EXPIRED');
  return decoded;
}

module.exports = {
  safeEqual, base64url, mintJWT, validateUsername,
  base32encode, base32decode, generateTOTPSecret, hotp, verifyTOTP,
  mintPendingJWT, verifyJWT, MFA_PENDING_SUB,
};
