'use strict';

const { verifyJWT, generateTOTPSecret } = require('../login/core');
const { listSettings, mergeSettings, getConfig, KEYS } = require('../appsettings');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const SESSION_SUB = 'codelegion';

module.exports = async function mfaSetup(context, req) {
  if (!getConfig()) {
    context.log.error('ARM configuration missing');
    context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
    return;
  }

  const authHeader = (req.headers && req.headers.authorization) || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearerToken) {
    context.res = { status: 401, headers: CORS, body: { error: 'Authorization required.' } };
    return;
  }

  try {
    const settings = await listSettings();
    if (!settings || !settings[KEYS.SETUP]) {
      context.res = { status: 404, headers: CORS, body: { error: 'No credentials configured.', needsSetup: true } };
      return;
    }

    const jwtSecret = settings[KEYS.JWT_SECRET];
    if (!jwtSecret) {
      context.log.error('JWT secret missing');
      context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
      return;
    }

    try {
      verifyJWT(jwtSecret, bearerToken, SESSION_SUB);
    } catch {
      context.res = { status: 401, headers: CORS, body: { error: 'Invalid or expired token.' } };
      return;
    }

    const totpSecret = generateTOTPSecret();
    await mergeSettings({ [KEYS.TOTP_SECRET]: totpSecret });

    const uri = `otpauth://totp/CodeLegion?secret=${totpSecret}&issuer=CodeLegion&digits=6&period=30`;
    context.res = { status: 200, headers: CORS, body: { uri } };
  } catch (err) {
    context.log.error('MFA setup error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
