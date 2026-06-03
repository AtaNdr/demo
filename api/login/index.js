'use strict';

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { safeEqual, mintJWT, parseCredentials } = require('./core');

const VAULT_URI = process.env.KEY_VAULT_URI;
const JWT_SECRET_NAME = process.env.JWT_SECRET_NAME || 'jwt-signing-secret';
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

let secretClient;
function getClient() {
  if (!secretClient) {
    secretClient = new SecretClient(VAULT_URI, new DefaultAzureCredential());
  }
  return secretClient;
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

module.exports = async function login(context, req) {
  if (!VAULT_URI) {
    context.log.error('KEY_VAULT_URI is not set');
    context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = { status: 400, headers: CORS, body: { error: 'Username and password are required.' } };
    return;
  }

  try {
    const client = getClient();
    let credSecret, jwtSecret;

    try {
      [credSecret, jwtSecret] = await Promise.all([
        client.getSecret(username),
        client.getSecret(JWT_SECRET_NAME),
      ]);
    } catch (err) {
      if (err.statusCode === 404) {
        context.res = { status: 404, headers: CORS, body: { error: 'No credentials configured.', needsSetup: true } };
        return;
      }
      throw err;
    }

    const creds = parseCredentials(credSecret.value);
    if (!creds) {
      context.log.error('Credential secret is not valid JSON with user/pass fields');
      context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
      return;
    }

    const usernameOk = safeEqual(username, creds.user);
    const passwordOk = safeEqual(password, creds.pass);

    if (!usernameOk || !passwordOk) {
      context.res = { status: 401, headers: CORS, body: { error: 'Incorrect username or password.' } };
      return;
    }

    context.res = {
      status: 200,
      headers: CORS,
      body: { token: mintJWT(jwtSecret.value, TOKEN_TTL_SECONDS) },
    };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
