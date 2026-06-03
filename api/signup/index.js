'use strict';

const crypto = require('crypto');
const { listSettings, mergeSettings, getConfig, KEYS } = require('../appsettings');
const { validateUsername } = require('../login/core');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

module.exports = async function signup(context, req) {
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

  if (!validateUsername(username)) {
    context.res = {
      status: 400,
      headers: CORS,
      body: { error: 'Username must be 1–127 characters, alphanumeric and hyphens only, and may not start with a hyphen.' },
    };
    return;
  }

  try {
    const settings = await listSettings();
    if (settings && settings[KEYS.SETUP]) {
      context.res = { status: 409, headers: CORS, body: { error: 'System is already configured. Please log in.' } };
      return;
    }

    await mergeSettings({
      [KEYS.USERNAME]: username,
      [KEYS.PASSWORD]: password,
      [KEYS.JWT_SECRET]: crypto.randomBytes(32).toString('hex'),
      [KEYS.SETUP]: '1',
    });

    context.res = { status: 201, headers: CORS, body: { message: 'Account created. You can now log in.' } };
  } catch (err) {
    context.log.error('Signup error:', err.message);
    context.res = { status: 500, headers: CORS, body: { error: 'An unexpected error occurred. Please try again.' } };
  }
};
