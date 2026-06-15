'use strict';

// Run with: node mfa.test.js  (from the api/ directory)
// No test framework required — pure Node.js assert

const assert = require('assert');
const crypto = require('crypto');
const {
  base32encode, base32decode,
  generateTOTPSecret, hotp, verifyTOTP,
  mintPendingJWT, mintJWT, verifyJWT, MFA_PENDING_SUB,
} = require('./login/core');

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL  ' + name + '\n        ' + e.message);
    fail++;
  }
}

function mockMod(resolvedPath, exports) {
  const orig = require.cache[resolvedPath];
  require.cache[resolvedPath] = {
    id: resolvedPath, filename: resolvedPath,
    loaded: true, exports, children: [], paths: [],
  };
  return () => {
    if (orig) require.cache[resolvedPath] = orig;
    else delete require.cache[resolvedPath];
  };
}

function fresh(relPath) {
  const resolved = require.resolve(relPath);
  delete require.cache[resolved];
  return require(relPath);
}

function ctx() {
  return { res: {}, log: { error() {} } };
}

const APP_PATH = require.resolve('./appsettings');
const KEYS = {
  USERNAME: 'CODELEGION_USERNAME',
  PASSWORD: 'CODELEGION_PASSWORD',
  JWT_SECRET: 'CODELEGION_JWT_SECRET',
  SETUP: 'CODELEGION_SETUP',
  TOTP_SECRET: 'CODELEGION_TOTP_SECRET',
};

(async function main() {

  // ── base32 ────────────────────────────────────────────────────────────────────

  await test('base32encode: output is uppercase alphanumeric, no padding', () => {
    const result = base32encode(Buffer.from([0xf8, 0x3e, 0x7f]));
    assert.ok(/^[A-Z2-7]+$/.test(result), 'must be uppercase base32 alphabet');
  });

  await test('base32decode(base32encode(x)) round-trips correctly', () => {
    const original = crypto.randomBytes(20);
    const encoded = base32encode(original);
    const decoded = base32decode(encoded);
    assert.ok(original.equals(decoded), 'round-trip must be lossless');
  });

  await test('base32decode: throws on invalid character', () => {
    assert.throws(() => base32decode('INVALID!'), /Invalid base32/);
  });

  await test('base32decode: strips trailing padding gracefully', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    const encoded = base32encode(buf) + '====';
    assert.doesNotThrow(() => base32decode(encoded));
  });

  // ── generateTOTPSecret ────────────────────────────────────────────────────────

  await test('generateTOTPSecret: returns a non-empty base32 string', () => {
    const secret = generateTOTPSecret();
    assert.ok(typeof secret === 'string' && secret.length > 0);
    assert.ok(/^[A-Z2-7]+$/.test(secret), 'must be valid base32');
  });

  await test('generateTOTPSecret: each call produces a different value', () => {
    const s1 = generateTOTPSecret();
    const s2 = generateTOTPSecret();
    assert.notStrictEqual(s1, s2);
  });

  // ── hotp ──────────────────────────────────────────────────────────────────────

  await test('hotp: output is always a 6-digit zero-padded string', () => {
    const secret = generateTOTPSecret();
    const code = hotp(secret, 0);
    assert.ok(/^\d{6}$/.test(code), `expected 6-digit string, got: ${code}`);
  });

  await test('hotp: same secret + counter always yields same code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    assert.strictEqual(hotp(secret, 1), hotp(secret, 1));
  });

  await test('hotp: different counters yield different codes (usual case)', () => {
    const secret = generateTOTPSecret();
    // Counter 0 and 1000000 are very unlikely to collide
    assert.notStrictEqual(hotp(secret, 0), hotp(secret, 1000000));
  });

  // ── verifyTOTP ────────────────────────────────────────────────────────────────

  await test('verifyTOTP: current window code passes', () => {
    const secret = generateTOTPSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const correctCode = hotp(secret, counter);
    assert.strictEqual(verifyTOTP(secret, correctCode), true);
  });

  await test('verifyTOTP: previous window code passes (−1 tolerance)', () => {
    const secret = generateTOTPSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const prevCode = hotp(secret, counter - 1);
    assert.strictEqual(verifyTOTP(secret, prevCode), true);
  });

  await test('verifyTOTP: next window code passes (+1 tolerance)', () => {
    const secret = generateTOTPSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const nextCode = hotp(secret, counter + 1);
    assert.strictEqual(verifyTOTP(secret, nextCode), true);
  });

  await test('verifyTOTP: code two windows ahead fails', () => {
    const secret = generateTOTPSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const futureCode = hotp(secret, counter + 2);
    // Could theoretically collide with another window — check all three windows differ
    const current = hotp(secret, counter);
    const prev = hotp(secret, counter - 1);
    const next = hotp(secret, counter + 1);
    if (futureCode === current || futureCode === prev || futureCode === next) {
      // Astronomically rare collision — skip rather than false-fail
      console.log('  SKIP  verifyTOTP: code two windows ahead fails (counter collision)');
      pass++;
      return;
    }
    assert.strictEqual(verifyTOTP(secret, futureCode), false);
  });

  await test('verifyTOTP: wrong code returns false', () => {
    const secret = generateTOTPSecret();
    assert.strictEqual(verifyTOTP(secret, '000000'), false);
  });

  await test('verifyTOTP: wrong secret returns false', () => {
    const secret1 = generateTOTPSecret();
    const secret2 = generateTOTPSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = hotp(secret1, counter);
    // code from secret1 should not verify against secret2
    assert.strictEqual(verifyTOTP(secret2, code), false);
  });

  // ── mintPendingJWT / verifyJWT ────────────────────────────────────────────────

  await test('mintPendingJWT: produces a three-part JWT', () => {
    const token = mintPendingJWT('secret', 300);
    assert.strictEqual(token.split('.').length, 3);
  });

  await test('verifyJWT: accepts a freshly minted pending token', () => {
    const secret = 'test-secret';
    const token = mintPendingJWT(secret, 300);
    assert.doesNotThrow(() => verifyJWT(secret, token, MFA_PENDING_SUB));
  });

  await test('verifyJWT: returns payload with correct sub', () => {
    const secret = 'test-secret';
    const token = mintPendingJWT(secret, 300);
    const payload = verifyJWT(secret, token, MFA_PENDING_SUB);
    assert.strictEqual(payload.sub, MFA_PENDING_SUB);
  });

  await test('verifyJWT: rejects expired token', () => {
    const secret = 'test-secret';
    const token = mintPendingJWT(secret, -1); // already expired
    assert.throws(() => verifyJWT(secret, token, MFA_PENDING_SUB), /TOKEN_EXPIRED/);
  });

  await test('verifyJWT: rejects tampered signature', () => {
    const secret = 'test-secret';
    const token = mintPendingJWT(secret, 300);
    const parts = token.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.invalidsig';
    assert.throws(() => verifyJWT(secret, tampered, MFA_PENDING_SUB), /INVALID_SIGNATURE/);
  });

  await test('verifyJWT: rejects wrong sub', () => {
    const secret = 'test-secret';
    const sessionToken = mintJWT(secret, 300); // sub: 'codelegion'
    assert.throws(() => verifyJWT(secret, sessionToken, MFA_PENDING_SUB), /WRONG_SUB/);
  });

  await test('verifyJWT: rejects malformed token (wrong number of parts)', () => {
    assert.throws(() => verifyJWT('secret', 'not.a.valid.jwt', MFA_PENDING_SUB), /INVALID_TOKEN/);
    assert.throws(() => verifyJWT('secret', 'onlyone', MFA_PENDING_SUB), /INVALID_TOKEN/);
  });

  await test('verifyJWT: rejects null/empty token', () => {
    assert.throws(() => verifyJWT('secret', null, MFA_PENDING_SUB), /INVALID_TOKEN/);
    assert.throws(() => verifyJWT('secret', '', MFA_PENDING_SUB), /INVALID_TOKEN/);
  });

  // ── login handler (MFA branch) ────────────────────────────────────────────────

  await test('login: with TOTP enrolled — returns mfaRequired + mfaToken', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.USERNAME]: 'alice',
        [KEYS.PASSWORD]: 'pass',
        [KEYS.JWT_SECRET]: 'testsecret',
        [KEYS.TOTP_SECRET]: generateTOTPSecret(),
      }),
      KEYS,
    });
    const handler = fresh('./login/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 200);
    assert.strictEqual(c.res.body.mfaRequired, true);
    assert.ok(c.res.body.mfaToken, 'should include mfaToken');
    assert.strictEqual(c.res.body.token, undefined, 'must not return final token yet');
  });

  await test('login: without TOTP enrolled — returns final token directly (backward-compat)', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.USERNAME]: 'alice',
        [KEYS.PASSWORD]: 'pass',
        [KEYS.JWT_SECRET]: 'testsecret',
        // No TOTP_SECRET
      }),
      KEYS,
    });
    const handler = fresh('./login/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 200);
    assert.ok(c.res.body.token, 'should return final JWT');
    assert.strictEqual(c.res.body.mfaRequired, undefined);
  });

  // ── mfa-setup handler ─────────────────────────────────────────────────────────

  await test('mfa-setup: returns 401 with no Authorization header', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1', [KEYS.JWT_SECRET]: 'secret' }),
      mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('./mfa-setup/index');
    restore();
    const c = ctx();
    await handler(c, { headers: {}, body: {} });
    assert.strictEqual(c.res.status, 401);
  });

  await test('mfa-setup: returns 401 with invalid token', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1', [KEYS.JWT_SECRET]: 'secret' }),
      mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('./mfa-setup/index');
    restore();
    const c = ctx();
    await handler(c, { headers: { authorization: 'Bearer bad.token.here' }, body: {} });
    assert.strictEqual(c.res.status, 401);
  });

  await test('mfa-setup: returns 200 + otpauth URI with valid session token', async () => {
    const jwtSecret = 'testsecret';
    const validToken = mintJWT(jwtSecret, 3600);
    let stored = null;
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1', [KEYS.JWT_SECRET]: jwtSecret }),
      mergeSettings: async (s) => { stored = s; }, KEYS,
    });
    const handler = fresh('./mfa-setup/index');
    restore();
    const c = ctx();
    await handler(c, { headers: { authorization: `Bearer ${validToken}` }, body: {} });
    assert.strictEqual(c.res.status, 200);
    assert.ok(c.res.body.uri, 'should return otpauth URI');
    assert.ok(c.res.body.uri.startsWith('otpauth://totp/'), 'URI must be otpauth://totp/');
    assert.ok(stored && stored[KEYS.TOTP_SECRET], 'should store TOTP secret via mergeSettings');
  });

  await test('mfa-setup: returns 500 when ARM not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => null, listSettings: async () => null, mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('./mfa-setup/index');
    restore();
    const c = ctx();
    await handler(c, { headers: { authorization: 'Bearer anything' }, body: {} });
    assert.strictEqual(c.res.status, 500);
  });

  await test('mfa-setup: returns 404 when not yet configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), // no SETUP key
      mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('./mfa-setup/index');
    restore();
    const c = ctx();
    await handler(c, { headers: { authorization: 'Bearer anything' }, body: {} });
    assert.strictEqual(c.res.status, 404);
    assert.strictEqual(c.res.body.needsSetup, true);
  });

  // ── mfa-verify handler ────────────────────────────────────────────────────────

  await test('mfa-verify: returns 400 when mfaToken missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1', [KEYS.JWT_SECRET]: 'secret', [KEYS.TOTP_SECRET]: 'ABC' }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { code: '123456' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('mfa-verify: returns 400 when code missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1', [KEYS.JWT_SECRET]: 'secret', [KEYS.TOTP_SECRET]: 'ABC' }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken: 'some.token.here' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('mfa-verify: returns 400 when mfaToken is expired', async () => {
    const jwtSecret = 'testsecret';
    const totpSecret = generateTOTPSecret();
    const expiredToken = mintPendingJWT(jwtSecret, -1);
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.JWT_SECRET]: jwtSecret,
        [KEYS.TOTP_SECRET]: totpSecret,
      }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken: expiredToken, code: '000000' } });
    assert.strictEqual(c.res.status, 400);
    assert.ok(/expired/i.test(c.res.body.error), 'error should mention expiry');
  });

  await test('mfa-verify: returns 400 when mfaToken has wrong sub (is a session token)', async () => {
    const jwtSecret = 'testsecret';
    const totpSecret = generateTOTPSecret();
    const sessionToken = mintJWT(jwtSecret, 300); // sub: 'codelegion', not mfa-pending
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.JWT_SECRET]: jwtSecret,
        [KEYS.TOTP_SECRET]: totpSecret,
      }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken: sessionToken, code: '000000' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('mfa-verify: returns 401 when TOTP code is wrong', async () => {
    const jwtSecret = 'testsecret';
    const totpSecret = generateTOTPSecret();
    const mfaToken = mintPendingJWT(jwtSecret, 300);
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.JWT_SECRET]: jwtSecret,
        [KEYS.TOTP_SECRET]: totpSecret,
      }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    // Use a code that is definitely wrong (all zeros unlikely to be correct)
    const counter = Math.floor(Date.now() / 1000 / 30);
    const correctCode = hotp(totpSecret, counter);
    const wrongCode = correctCode === '000000' ? '111111' : '000000';
    await handler(c, { body: { mfaToken, code: wrongCode } });
    assert.strictEqual(c.res.status, 401);
  });

  await test('mfa-verify: returns 200 + final JWT when mfaToken and TOTP code are both valid', async () => {
    const jwtSecret = 'testsecret';
    const totpSecret = generateTOTPSecret();
    const mfaToken = mintPendingJWT(jwtSecret, 300);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const correctCode = hotp(totpSecret, counter);
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.JWT_SECRET]: jwtSecret,
        [KEYS.TOTP_SECRET]: totpSecret,
      }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken, code: correctCode } });
    assert.strictEqual(c.res.status, 200);
    assert.ok(c.res.body.token, 'should return a final session token');
    assert.strictEqual(c.res.body.token.split('.').length, 3, 'final token must be a three-part JWT');
  });

  await test('mfa-verify: returns 500 when ARM not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => null, listSettings: async () => null, KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken: 'tok', code: '123456' } });
    assert.strictEqual(c.res.status, 500);
  });

  await test('mfa-verify: returns 500 when TOTP not configured server-side', async () => {
    const jwtSecret = 'testsecret';
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.JWT_SECRET]: jwtSecret,
        // No TOTP_SECRET — MFA not enrolled
      }),
      KEYS,
    });
    const handler = fresh('./mfa-verify/index');
    restore();
    const c = ctx();
    await handler(c, { body: { mfaToken: 'tok', code: '123456' } });
    assert.strictEqual(c.res.status, 500);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);

})();
