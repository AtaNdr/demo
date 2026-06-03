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

function parseCredentials(jsonStr) {
  try {
    const creds = JSON.parse(jsonStr);
    if (typeof creds.user !== 'string' || typeof creds.pass !== 'string') return null;
    return creds;
  } catch {
    return null;
  }
}

// Key Vault secret names: 1-127 chars, alphanumeric + hyphens, no leading/trailing hyphen.
// Also reject names reserved for internal setup secrets.
const RESERVED = new Set(['codelegion-setup', 'jwt-signing-secret']);

function validateUsername(username) {
  if (typeof username !== 'string') return false;
  if (!(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,126}$/.test(username))) return false;
  return !RESERVED.has(username);
}

module.exports = { safeEqual, base64url, mintJWT, parseCredentials, validateUsername };
