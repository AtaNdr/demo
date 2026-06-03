'use strict';

const crypto = require('crypto');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { validateUsername } = require('../login/core');

const VAULT_URI = process.env.KEY_VAULT_URI;
const SETUP_FLAG = 'codelegion-setup';
const JWT_SECRET_NAME = 'jwt-signing-secret';

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

module.exports = async function signup(context, req) {
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

  if (!validateUsername(username)) {
    context.res = {
      status: 400,
      headers: CORS,
      body: { error: 'Username must be 1–127 characters, alphanumeric and hyphens only, and may not start with a hyphen.' },
    };
    return;
  }

  try {
    const client = getClient();

    // Reject if already configured (single-user enforcement)
    try {
      await client.getSecret(SETUP_FLAG);
      context.res = { status: 409, headers: CORS, body: { error: 'System is already configured. Please log in.' } };
      return;
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }

    // Store credential as JSON secret named after the username
    const credJson = JSON.stringify({ user: username, pass: password });
    await client.setSecret(username, credJson);

    // Auto-generate JWT signing secret so the system is fully self-configuring
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    await client.setSecret(JWT_SECRET_NAME, jwtSecret);

    // Mark setup as complete — this is the gate checked by /api/status
    await client.setSecret(SETUP_FLAG, 'true');

    context.res = { status: 201, headers: CORS, body: { message: 'Account created. You can now log in.' } };
  } catch (err) {
    context.log.error('Signup error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
