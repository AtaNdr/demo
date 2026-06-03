'use strict';

const { safeEqual, mintJWT } = require('./core');
const { listSettings, getConfig, KEYS } = require('../appsettings');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

module.exports = async function login(context, req) {
  if (!getConfig()) {
    context.log.error('ARM configuration missing');
    context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = { status: 400, headers: CORS, body: { error: 'Username and password are required.' } };
    return;
  }

  try {
    const settings = await listSettings();
    if (!settings || !settings[KEYS.SETUP]) {
      context.res = { status: 404, headers: CORS, body: { error: 'No credentials configured.', needsSetup: true } };
      return;
    }

    const storedUsername = settings[KEYS.USERNAME];
    const storedPassword = settings[KEYS.PASSWORD];
    const jwtSecret = settings[KEYS.JWT_SECRET];

    if (!storedUsername || !storedPassword || !jwtSecret) {
      context.log.error('Credential settings incomplete');
      context.res = { status: 500, headers: CORS, body: { error: 'Server configuration error.' } };
      return;
    }

    if (!safeEqual(username, storedUsername) || !safeEqual(password, storedPassword)) {
      context.res = { status: 401, headers: CORS, body: { error: 'Incorrect username or password.' } };
      return;
    }

    context.res = { status: 200, headers: CORS, body: { token: mintJWT(jwtSecret, TOKEN_TTL_SECONDS) } };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
