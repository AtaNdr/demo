'use strict';

// Run with: node api/login/index.test.js
// No test framework required — pure Node.js assert

const assert = require('assert');
const { safeEqual, base64url, mintJWT, parseCredentials, validateUsername } = require('./core');

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

// ── parseCredentials ─────────────────────────────────────────────────────────

test('parseCredentials: valid JSON with user and pass returns object', () => {
  const result = parseCredentials('{"user":"alice","pass":"s3cret"}');
  assert.deepStrictEqual(result, { user: 'alice', pass: 's3cret' });
});

test('parseCredentials: missing user field returns null', () => {
  assert.strictEqual(parseCredentials('{"pass":"s3cret"}'), null);
});

test('parseCredentials: missing pass field returns null', () => {
  assert.strictEqual(parseCredentials('{"user":"alice"}'), null);
});

test('parseCredentials: non-string user returns null', () => {
  assert.strictEqual(parseCredentials('{"user":1,"pass":"s3cret"}'), null);
});

test('parseCredentials: invalid JSON returns null', () => {
  assert.strictEqual(parseCredentials('not-json'), null);
});

test('parseCredentials: empty string returns null', () => {
  assert.strictEqual(parseCredentials(''), null);
});

test('parseCredentials: extra fields are preserved', () => {
  const result = parseCredentials('{"user":"alice","pass":"s3cret","extra":"value"}');
  assert.ok(result !== null);
  assert.strictEqual(result.user, 'alice');
  assert.strictEqual(result.pass, 's3cret');
});

// ── validateUsername ──────────────────────────────────────────────────────────

test('validateUsername: simple alphanumeric accepted', () => {
  assert.strictEqual(validateUsername('alice'), true);
});

test('validateUsername: alphanumeric with hyphen accepted', () => {
  assert.strictEqual(validateUsername('alice-admin'), true);
});

test('validateUsername: single character accepted', () => {
  assert.strictEqual(validateUsername('a'), true);
});

test('validateUsername: empty string rejected', () => {
  assert.strictEqual(validateUsername(''), false);
});

test('validateUsername: leading hyphen rejected', () => {
  assert.strictEqual(validateUsername('-alice'), false);
});

test('validateUsername: underscore rejected (not allowed in KV secret names)', () => {
  assert.strictEqual(validateUsername('alice_admin'), false);
});

test('validateUsername: spaces rejected', () => {
  assert.strictEqual(validateUsername('alice admin'), false);
});

test('validateUsername: non-string rejected', () => {
  assert.strictEqual(validateUsername(42), false);
  assert.strictEqual(validateUsername(null), false);
});

test('validateUsername: reserved name codelegion-setup rejected', () => {
  assert.strictEqual(validateUsername('codelegion-setup'), false);
});

test('validateUsername: reserved name jwt-signing-secret rejected', () => {
  assert.strictEqual(validateUsername('jwt-signing-secret'), false);
});

test('validateUsername: 127-char name accepted', () => {
  const name = 'a' + 'b'.repeat(126);
  assert.strictEqual(validateUsername(name), true);
});

test('validateUsername: 128-char name rejected', () => {
  const name = 'a' + 'b'.repeat(127);
  assert.strictEqual(validateUsername(name), false);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
