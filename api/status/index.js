'use strict';

const { listSettings, getConfig, KEYS } = require('../appsettings');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

module.exports = async function status(context) {
  if (!getConfig()) {
    context.res = { status: 200, headers: CORS, body: { isSetup: false } };
    return;
  }

  try {
    const settings = await listSettings();
    context.res = { status: 200, headers: CORS, body: { isSetup: !!(settings && settings[KEYS.SETUP]) } };
  } catch (err) {
    context.log.error('Status check error:', err.message);
    context.res = { status: 200, headers: CORS, body: { isSetup: false } };
  }
};
