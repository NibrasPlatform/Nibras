const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGateway() {
  const source = fs.readFileSync(
    path.join(__dirname, '../Frontend/client/gateway-host.js'),
    'utf8',
  );
  const context = { window: {}, console, URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.NibrasGateway;
}

test('isGatewayHost recognizes Azure Container Apps hosts', () => {
  const gw = loadGateway();
  assert.equal(
    gw.isGatewayHost('nibras-web.agreeablebush-214764d1.uaenorth.azurecontainerapps.io'),
    true,
  );
  assert.equal(gw.isGatewayHost('api-production-1234.up.railway.app'), false);
});

test('shouldIgnoreStoredApiUrl rejects cross-origin storage on gateway hosts', () => {
  const gw = loadGateway();
  const pageOrigin = 'https://nibras-web.example.azurecontainerapps.io';
  const railway =
    'https://web-production-3011ec.up.railway.app/api';
  assert.equal(
    gw.shouldIgnoreStoredApiUrl(railway, pageOrigin, true),
    true,
  );
  assert.equal(
    gw.shouldIgnoreStoredApiUrl(`${pageOrigin}/api`, pageOrigin, true),
    false,
  );
  assert.equal(
    gw.shouldIgnoreStoredApiUrl(railway, pageOrigin, false),
    false,
  );
});

test('gatewayOrigin uses page origin on Azure gateway hosts', () => {
  const gw = loadGateway();
  const origin = gw.gatewayOrigin({
    hostname: 'nibras-web.example.azurecontainerapps.io',
    origin: 'https://nibras-web.example.azurecontainerapps.io',
  });
  assert.equal(origin, 'https://nibras-web.example.azurecontainerapps.io');
});
