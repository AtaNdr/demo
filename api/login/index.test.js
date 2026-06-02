'use strict';

// Run with: node api/login/index.test.js
// No test framework required — pure Node.js assert

const assert = require('assert');
const { safeEqual, base64url, mintJWT } = require('./core');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL  ' + name + '\n        ' + e.message);
    fail++;
  }
}

// ── safeEqual ───────────────────────────────────────────────────────────────

test('safeEqual: matching strings return true', () => {
  assert.strictEqual(safeEqual('correcthorsebatterystaple', 'correcthorsebatterystaple'), true);
});

test('safeEqual: non-matching strings return false', () => {
  assert.strictEqual(safeEqual('correct', 'wrong'), false);
});

test('safeEqual: empty string vs non-empty returns false', () => {
  assert.strictEqual(safeEqual('', 'notempty'), false);
});

test('safeEqual: both empty returns true', () => {
  assert.strictEqual(safeEqual('', ''), true);
});

test('safeEqual: case-sensitive (Admin vs admin)', () => {
  assert.strictEqual(safeEqual('Admin', 'admin'), false);
});

test('safeEqual: prefix match is not a match', () => {
  assert.strictEqual(safeEqual('pass', 'password'), false);
  assert.strictEqual(safeEqual('password', 'pass'), false);
});

test('safeEqual: multi-byte characters handled correctly', () => {
  assert.strictEqual(safeEqual('café', 'café'), true);
  assert.strictEqual(safeEqual('café', 'cafe'), false);
});

// ── base64url ────────────────────────────────────────────────────────────────

test('base64url: output contains no standard base64 padding or special chars', () => {
  const result = base64url('{"alg":"HS256","typ":"JWT"}');
  assert.ok(!/[+/=]/.test(result), 'must not contain +, /, or =');
});

test('base64url: round-trips via standard base64 decode', () => {
  const input = '{"sub":"codelegion"}';
  const encoded = base64url(input);
  // Restore standard base64 padding to decode
  const pad = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '==='.slice(0, (4 - pad.length % 4) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  assert.strictEqual(decoded, input);
});

// ── mintJWT ──────────────────────────────────────────────────────────────────

test('mintJWT: returns a three-part dot-separated token', () => {
  const token = mintJWT('s3cr3t', 3600);
  assert.strictEqual(token.split('.').length, 3);
});

test('mintJWT: header decodes to HS256/JWT', () => {
  const token = mintJWT('s3cr3t', 3600);
  const [rawHeader] = token.split('.');
  const pad = rawHeader.replace(/-/g, '+').replace(/_/g, '/');
  const header = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
  assert.strictEqual(header.alg, 'HS256');
  assert.strictEqual(header.typ, 'JWT');
});

test('mintJWT: payload has exp in the future', () => {
  const ttl = 3600;
  const before = Math.floor(Date.now() / 1000);
  const token = mintJWT('s3cr3t', ttl);
  const [, rawPayload] = token.split('.');
  const pad = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
  assert.ok(payload.exp >= before + ttl - 1, 'exp should be ~TTL seconds from now');
  assert.ok(payload.exp <= before + ttl + 2, 'exp should not be far in the future');
});

test('mintJWT: payload has correct sub claim', () => {
  const token = mintJWT('s3cr3t', 3600);
  const [, rawPayload] = token.split('.');
  const pad = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
  assert.strictEqual(payload.sub, 'codelegion');
});

test('mintJWT: different secrets produce different signatures', () => {
  const t1 = mintJWT('secret-A', 3600);
  const t2 = mintJWT('secret-B', 3600);
  assert.notStrictEqual(t1.split('.')[2], t2.split('.')[2]);
});

test('mintJWT: same secret, different TTL produces different payload', () => {
  const t1 = mintJWT('s3cr3t', 3600);
  const t2 = mintJWT('s3cr3t', 7200);
  assert.notStrictEqual(t1.split('.')[1], t2.split('.')[1]);
});

test('mintJWT: token signature is not present in base64url output as +/=', () => {
  const token = mintJWT('s3cr3t', 3600);
  assert.ok(!/[+/=]/.test(token), 'full token must be URL-safe');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
