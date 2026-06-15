'use strict';

const https = require('https');
const { DefaultAzureCredential } = require('@azure/identity');

const KEYS = {
  USERNAME: 'CODELEGION_USERNAME',
  PASSWORD: 'CODELEGION_PASSWORD',
  JWT_SECRET: 'CODELEGION_JWT_SECRET',
  SETUP: 'CODELEGION_SETUP',
  TOTP_SECRET: 'CODELEGION_TOTP_SECRET',
};

function getConfig() {
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const site = process.env.AZURE_STATIC_SITE_NAME;
  return (sub && rg && site) ? { sub, rg, site } : null;
}

let _credential;
function getCredential() {
  if (!_credential) _credential = new DefaultAzureCredential();
  return _credential;
}

async function getToken() {
  const resp = await getCredential().getToken('https://management.azure.com/.default');
  return resp.token;
}

function armRequest(method, armPath, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : '';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr));

    const req = https.request(
      { hostname: 'management.azure.com', path: armPath, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function basePath(cfg) {
  return `/subscriptions/${encodeURIComponent(cfg.sub)}`
    + `/resourceGroups/${encodeURIComponent(cfg.rg)}`
    + `/providers/Microsoft.Web/staticSites/${encodeURIComponent(cfg.site)}`;
}

async function listSettings() {
  const cfg = getConfig();
  if (!cfg) return null;
  const token = await getToken();
  const res = await armRequest('POST', `${basePath(cfg)}/config/appsettings/list?api-version=2022-03-01`, token, {});
  if (res.status !== 200) return null;
  return res.body.properties || {};
}

// Merge newSettings into the existing app settings without clobbering unrelated keys.
async function mergeSettings(newSettings) {
  const cfg = getConfig();
  if (!cfg) throw new Error('ARM_CONFIG_MISSING');
  const token = await getToken();

  const listRes = await armRequest('POST', `${basePath(cfg)}/config/appsettings/list?api-version=2022-03-01`, token, {});
  const existing = (listRes.status === 200 && listRes.body.properties) ? listRes.body.properties : {};

  const merged = { ...existing, ...newSettings };

  const putRes = await armRequest('PUT', `${basePath(cfg)}/config/appsettings?api-version=2022-03-01`, token, { properties: merged });
  if (putRes.status < 200 || putRes.status >= 300) {
    throw new Error(`ARM_PUT_FAILED:${putRes.status}`);
  }
}

module.exports = { listSettings, mergeSettings, getConfig, KEYS };
