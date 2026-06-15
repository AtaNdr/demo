'use strict';

const { verifyJWT, verifyTOTP, mintJWT, MFA_PENDING_SUB } = require('../login/core');
const { listSettings, getConfig, KEYS } = require('../appsettings');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

module.exports = async function mfaVerify(context, req) {
  if (!getConfig()) {
    context.log.error('ARM configuration missing');
    context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
    return;
  }

  const { mfaToken, code } = req.body || {};

  if (!mfaToken || !code) {
    context.res = { status: 400, headers: CORS, body: { error: 'mfaToken and code are required.' } };
    return;
  }

  try {
    const settings = await listSettings();
    if (!settings || !settings[KEYS.SETUP]) {
      context.res = { status: 404, headers: CORS, body: { error: 'No credentials configured.', needsSetup: true } };
      return;
    }

    const jwtSecret = settings[KEYS.JWT_SECRET];
    const totpSecret = settings[KEYS.TOTP_SECRET];

    if (!jwtSecret || !totpSecret) {
      context.log.error('MFA not configured');
      context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
      return;
    }

    try {
      verifyJWT(jwtSecret, mfaToken, MFA_PENDING_SUB);
    } catch (err) {
      const expired = err.message === 'TOKEN_EXPIRED';
      context.res = {
        status: 400,
        headers: CORS,
        body: { error: expired ? 'MFA token expired. Please log in again.' : 'Invalid MFA token.' },
      };
      return;
    }

    if (!verifyTOTP(totpSecret, String(code))) {
      context.res = { status: 401, headers: CORS, body: { error: 'Invalid or expired TOTP code.' } };
      return;
    }

    context.res = { status: 200, headers: CORS, body: { token: mintJWT(jwtSecret, TOKEN_TTL_SECONDS) } };
  } catch (err) {
    context.log.error('MFA verify error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
