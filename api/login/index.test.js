'use strict';

// Run with: node login/index.test.js  (from the api/ directory)
// No test framework required — pure Node.js assert

const assert = require('assert');
const { safeEqual, base64url, mintJWT, validateUsername } = require('./core');
const { getConfig } = require('../appsettings');

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

// Put a mock into the module cache; returns a restore function.
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

// Load a module fresh (clear its cache entry first).
function fresh(relPath) {
  const resolved = require.resolve(relPath);
  delete require.cache[resolved];
  return require(relPath);
}

function ctx() {
  return { res: {}, log: { error() {} } };
}

const APP_PATH = require.resolve('../appsettings');
const KEYS = { USERNAME: 'CODELEGION_USERNAME', PASSWORD: 'CODELEGION_PASSWORD', JWT_SECRET: 'CODELEGION_JWT_SECRET', SETUP: 'CODELEGION_SETUP' };

(async function main() {

  // ── safeEqual ────────────────────────────────────────────────────────────────

  await test('safeEqual: matching strings return true', () => {
    assert.strictEqual(safeEqual('correcthorsebatterystaple', 'correcthorsebatterystaple'), true);
  });

  await test('safeEqual: non-matching strings return false', () => {
    assert.strictEqual(safeEqual('correct', 'wrong'), false);
  });

  await test('safeEqual: empty string vs non-empty returns false', () => {
    assert.strictEqual(safeEqual('', 'notempty'), false);
  });

  await test('safeEqual: both empty returns true', () => {
    assert.strictEqual(safeEqual('', ''), true);
  });

  await test('safeEqual: case-sensitive (Admin vs admin)', () => {
    assert.strictEqual(safeEqual('Admin', 'admin'), false);
  });

  await test('safeEqual: prefix match is not a match', () => {
    assert.strictEqual(safeEqual('pass', 'password'), false);
    assert.strictEqual(safeEqual('password', 'pass'), false);
  });

  await test('safeEqual: multi-byte characters handled correctly', () => {
    assert.strictEqual(safeEqual('café', 'café'), true);
    assert.strictEqual(safeEqual('café', 'cafe'), false);
  });

  // ── base64url ─────────────────────────────────────────────────────────────────

  await test('base64url: output contains no standard base64 padding or special chars', () => {
    const result = base64url('{"alg":"HS256","typ":"JWT"}');
    assert.ok(!/[+/=]/.test(result), 'must not contain +, /, or =');
  });

  await test('base64url: round-trips via standard base64 decode', () => {
    const input = '{"sub":"codelegion"}';
    const encoded = base64url(input);
    const pad = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = pad + '==='.slice(0, (4 - pad.length % 4) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    assert.strictEqual(decoded, input);
  });

  // ── mintJWT ───────────────────────────────────────────────────────────────────

  await test('mintJWT: returns a three-part dot-separated token', () => {
    const token = mintJWT('s3cr3t', 3600);
    assert.strictEqual(token.split('.').length, 3);
  });

  await test('mintJWT: header decodes to HS256/JWT', () => {
    const token = mintJWT('s3cr3t', 3600);
    const [rawHeader] = token.split('.');
    const pad = rawHeader.replace(/-/g, '+').replace(/_/g, '/');
    const header = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
    assert.strictEqual(header.alg, 'HS256');
    assert.strictEqual(header.typ, 'JWT');
  });

  await test('mintJWT: payload has exp in the future', () => {
    const ttl = 3600;
    const before = Math.floor(Date.now() / 1000);
    const token = mintJWT('s3cr3t', ttl);
    const [, rawPayload] = token.split('.');
    const pad = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
    assert.ok(payload.exp >= before + ttl - 1, 'exp should be ~TTL seconds from now');
    assert.ok(payload.exp <= before + ttl + 2, 'exp should not be far in the future');
  });

  await test('mintJWT: payload has correct sub claim', () => {
    const token = mintJWT('s3cr3t', 3600);
    const [, rawPayload] = token.split('.');
    const pad = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(pad + '==='.slice(0, (4 - pad.length % 4) % 4), 'base64').toString());
    assert.strictEqual(payload.sub, 'codelegion');
  });

  await test('mintJWT: different secrets produce different signatures', () => {
    const t1 = mintJWT('secret-A', 3600);
    const t2 = mintJWT('secret-B', 3600);
    assert.notStrictEqual(t1.split('.')[2], t2.split('.')[2]);
  });

  await test('mintJWT: same secret, different TTL produces different payload', () => {
    const t1 = mintJWT('s3cr3t', 3600);
    const t2 = mintJWT('s3cr3t', 7200);
    assert.notStrictEqual(t1.split('.')[1], t2.split('.')[1]);
  });

  await test('mintJWT: token is fully URL-safe (no +/= chars)', () => {
    const token = mintJWT('s3cr3t', 3600);
    assert.ok(!/[+/=]/.test(token), 'full token must be URL-safe');
  });

  // ── validateUsername ──────────────────────────────────────────────────────────

  await test('validateUsername: simple alphanumeric accepted', () => {
    assert.strictEqual(validateUsername('alice'), true);
  });

  await test('validateUsername: alphanumeric with hyphen accepted', () => {
    assert.strictEqual(validateUsername('alice-admin'), true);
  });

  await test('validateUsername: single character accepted', () => {
    assert.strictEqual(validateUsername('a'), true);
  });

  await test('validateUsername: empty string rejected', () => {
    assert.strictEqual(validateUsername(''), false);
  });

  await test('validateUsername: leading hyphen rejected', () => {
    assert.strictEqual(validateUsername('-alice'), false);
  });

  await test('validateUsername: underscore rejected', () => {
    assert.strictEqual(validateUsername('alice_admin'), false);
  });

  await test('validateUsername: spaces rejected', () => {
    assert.strictEqual(validateUsername('alice admin'), false);
  });

  await test('validateUsername: non-string rejected', () => {
    assert.strictEqual(validateUsername(42), false);
    assert.strictEqual(validateUsername(null), false);
  });

  await test('validateUsername: names with hyphens are now accepted (no reserved list)', () => {
    assert.strictEqual(validateUsername('codelegion-setup'), true);
    assert.strictEqual(validateUsername('jwt-signing-secret'), true);
  });

  await test('validateUsername: 127-char name accepted', () => {
    assert.strictEqual(validateUsername('a' + 'b'.repeat(126)), true);
  });

  await test('validateUsername: 128-char name rejected', () => {
    assert.strictEqual(validateUsername('a' + 'b'.repeat(127)), false);
  });

  // ── appsettings: getConfig ────────────────────────────────────────────────────

  await test('appsettings.getConfig: returns null when env vars missing', () => {
    const origSub = process.env.AZURE_SUBSCRIPTION_ID;
    const origRg = process.env.AZURE_RESOURCE_GROUP;
    const origSite = process.env.AZURE_STATIC_SITE_NAME;
    delete process.env.AZURE_SUBSCRIPTION_ID;
    delete process.env.AZURE_RESOURCE_GROUP;
    delete process.env.AZURE_STATIC_SITE_NAME;
    try {
      assert.strictEqual(getConfig(), null);
    } finally {
      if (origSub !== undefined) process.env.AZURE_SUBSCRIPTION_ID = origSub;
      if (origRg !== undefined) process.env.AZURE_RESOURCE_GROUP = origRg;
      if (origSite !== undefined) process.env.AZURE_STATIC_SITE_NAME = origSite;
    }
  });

  await test('appsettings.getConfig: returns config object when all env vars set', () => {
    const orig = [process.env.AZURE_SUBSCRIPTION_ID, process.env.AZURE_RESOURCE_GROUP, process.env.AZURE_STATIC_SITE_NAME];
    process.env.AZURE_SUBSCRIPTION_ID = 'sub-123';
    process.env.AZURE_RESOURCE_GROUP = 'rg-test';
    process.env.AZURE_STATIC_SITE_NAME = 'site-test';
    try {
      const cfg = getConfig();
      assert.deepStrictEqual(cfg, { sub: 'sub-123', rg: 'rg-test', site: 'site-test' });
    } finally {
      [process.env.AZURE_SUBSCRIPTION_ID, process.env.AZURE_RESOURCE_GROUP, process.env.AZURE_STATIC_SITE_NAME] = orig;
    }
  });

  // ── status handler ────────────────────────────────────────────────────────────

  await test('status: returns isSetup:false when ARM not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => null, listSettings: async () => null, KEYS,
    });
    const handler = fresh('../status/index');
    restore();
    const c = ctx();
    await handler(c);
    assert.strictEqual(c.res.status, 200);
    assert.strictEqual(c.res.body.isSetup, false);
  });

  await test('status: returns isSetup:false when SETUP key absent', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}),
      KEYS,
    });
    const handler = fresh('../status/index');
    restore();
    const c = ctx();
    await handler(c);
    assert.strictEqual(c.res.body.isSetup, false);
  });

  await test('status: returns isSetup:true when SETUP key present', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1' }),
      KEYS,
    });
    const handler = fresh('../status/index');
    restore();
    const c = ctx();
    await handler(c);
    assert.strictEqual(c.res.body.isSetup, true);
  });

  await test('status: returns isSetup:false on ARM error (safe default)', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => { throw new Error('ARM error'); },
      KEYS,
    });
    const handler = fresh('../status/index');
    restore();
    const c = ctx();
    await handler(c);
    assert.strictEqual(c.res.body.isSetup, false);
  });

  // ── signup handler ────────────────────────────────────────────────────────────

  await test('signup: returns 500 when ARM not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => null, listSettings: async () => null, mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 500);
  });

  await test('signup: returns 400 when username missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { password: 'pass' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('signup: returns 400 when password missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('signup: returns 400 for invalid username (leading hyphen)', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: '-bad', password: 'pass' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('signup: returns 409 when already configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({ [KEYS.SETUP]: '1' }),
      mergeSettings: async () => {}, KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 409);
  });

  await test('signup: returns 201 on first successful setup', async () => {
    let mergedWith = null;
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}),
      mergeSettings: async (s) => { mergedWith = s; },
      KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'secr3t' } });
    assert.strictEqual(c.res.status, 201);
    assert.ok(mergedWith, 'mergeSettings should have been called');
    assert.strictEqual(mergedWith[KEYS.USERNAME], 'alice');
    assert.strictEqual(mergedWith[KEYS.PASSWORD], 'secr3t');
    assert.strictEqual(mergedWith[KEYS.SETUP], '1');
    assert.ok(mergedWith[KEYS.JWT_SECRET] && mergedWith[KEYS.JWT_SECRET].length === 64, 'JWT secret should be 32 random bytes hex');
  });

  await test('signup: returns 500 when mergeSettings throws', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}),
      mergeSettings: async () => { throw new Error('ARM_PUT_FAILED:500'); },
      KEYS,
    });
    const handler = fresh('../signup/index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 500);
  });

  // ── login handler ─────────────────────────────────────────────────────────────

  await test('login: returns 500 when ARM not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => null, listSettings: async () => null, KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 500);
  });

  await test('login: returns 400 when username missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { password: 'pass' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('login: returns 400 when password missing', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}), KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice' } });
    assert.strictEqual(c.res.status, 400);
  });

  await test('login: returns 404 with needsSetup:true when not configured', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({}),
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 404);
    assert.strictEqual(c.res.body.needsSetup, true);
  });

  await test('login: returns 401 on wrong password', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.USERNAME]: 'alice',
        [KEYS.PASSWORD]: 'correctpass',
        [KEYS.JWT_SECRET]: 'testsecret',
      }),
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'wrongpass' } });
    assert.strictEqual(c.res.status, 401);
  });

  await test('login: returns 401 on wrong username', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.USERNAME]: 'alice',
        [KEYS.PASSWORD]: 'pass',
        [KEYS.JWT_SECRET]: 'testsecret',
      }),
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'bob', password: 'pass' } });
    assert.strictEqual(c.res.status, 401);
  });

  await test('login: returns 200 with JWT token on correct credentials', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        [KEYS.USERNAME]: 'alice',
        [KEYS.PASSWORD]: 'correctpass',
        [KEYS.JWT_SECRET]: 'testsecret',
      }),
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'correctpass' } });
    assert.strictEqual(c.res.status, 200);
    assert.ok(c.res.body.token, 'response should include a token');
    assert.strictEqual(c.res.body.token.split('.').length, 3, 'token should be a three-part JWT');
  });

  await test('login: returns 500 when listSettings throws', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => { throw new Error('ARM error'); },
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 500);
  });

  await test('login: returns 500 when credential settings incomplete', async () => {
    const restore = mockMod(APP_PATH, {
      getConfig: () => ({ sub: 's', rg: 'r', site: 'n' }),
      listSettings: async () => ({
        [KEYS.SETUP]: '1',
        // Missing USERNAME, PASSWORD, JWT_SECRET
      }),
      KEYS,
    });
    const handler = fresh('./index');
    restore();
    const c = ctx();
    await handler(c, { body: { username: 'alice', password: 'pass' } });
    assert.strictEqual(c.res.status, 500);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);

})();
