'use strict';

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const VAULT_URI = process.env.KEY_VAULT_URI;
const SETUP_FLAG = 'codelegion-setup';

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

module.exports = async function status(context) {
  if (!VAULT_URI) {
    context.res = { status: 200, headers: CORS, body: { isSetup: false } };
    return;
  }

  try {
    const client = getClient();
    try {
      await client.getSecret(SETUP_FLAG);
      context.res = { status: 200, headers: CORS, body: { isSetup: true } };
    } catch (err) {
      if (err.statusCode === 404) {
        context.res = { status: 200, headers: CORS, body: { isSetup: false } };
        return;
      }
      throw err;
    }
  } catch (err) {
    context.log.error('Status check error:', err.message);
    // On error, default to not-setup so the user reaches the signup page and gets a clear error message there
    context.res = { status: 200, headers: CORS, body: { isSetup: false } };
  }
};
