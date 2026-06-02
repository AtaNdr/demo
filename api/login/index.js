'use strict';

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const crypto = require('crypto');

const VAULT_URI = process.env.KEY_VAULT_URI;
const USERNAME_SECRET = process.env.USERNAME_SECRET_NAME || 'login-username';
const PASSWORD_SECRET = process.env.PASSWORD_SECRET_NAME || 'login-password';
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'jwt-signing-secret';
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Module-level client — reused across warm invocations
let secretClient;
function getClient() {
  if (!secretClient) {
    secretClient = new SecretClient(VAULT_URI, new DefaultAzureCredential());
  }
  return secretClient;
}

// Constant-time string comparison to resist timing attacks
function safeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(len);
  const bufB = Buffer.alloc(len);
  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);
  return crypto.timingSafeEqual(bufA, bufB);
}

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function mintJWT(signingSecret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: 'codelegion', iat: now, exp: now + TOKEN_TTL_SECONDS }));
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${header}.${payload}.${signature}`;
}

module.exports = async function login(context, req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!VAULT_URI) {
    context.log.error('KEY_VAULT_URI is not set');
    context.res = { status: 500, headers: corsHeaders, body: { error: 'Server configuration error.' } };
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = { status: 400, headers: corsHeaders, body: { error: 'Username and password are required.' } };
    return;
  }

  try {
    const client = getClient();
    const [usernameSecret, passwordSecret, jwtSecret] = await Promise.all([
      client.getSecret(USERNAME_SECRET),
      client.getSecret(PASSWORD_SECRET),
      client.getSecret(JWT_SECRET_NAME),
    ]);

    const usernameOk = safeEqual(username, usernameSecret.value);
    const passwordOk = safeEqual(password, passwordSecret.value);

    if (!usernameOk || !passwordOk) {
      context.res = { status: 401, headers: corsHeaders, body: { error: 'Incorrect username or password.' } };
      return;
    }

    context.res = { status: 200, headers: corsHeaders, body: { token: mintJWT(jwtSecret.value) } };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, headers: corsHeaders, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
