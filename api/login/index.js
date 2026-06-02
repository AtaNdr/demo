'use strict';

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { safeEqual, mintJWT } = require('./core');

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

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function login(context, req) {
  if (!VAULT_URI) {
    context.log.error('KEY_VAULT_URI is not set');
    context.res = { status: 500, headers: CORS_HEADERS, body: { error: 'Server configuration error.' } };
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = { status: 400, headers: CORS_HEADERS, body: { error: 'Username and password are required.' } };
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
      context.res = { status: 401, headers: CORS_HEADERS, body: { error: 'Incorrect username or password.' } };
      return;
    }

    context.res = {
      status: 200,
      headers: CORS_HEADERS,
      body: { token: mintJWT(jwtSecret.value, TOKEN_TTL_SECONDS) },
    };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, headers: CORS_HEADERS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
