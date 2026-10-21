const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {setTimeout: pause} = require('node:timers/promises');
const {CirculationResources} = require('./support/ph-redis-resources.cjs');
const {expectRequest} = require('./support/ph-redis-api.cjs');
const {deviceSignIn} = require('./support/device-signin.cjs');
const {chromium} = require(process.env.POCKETDATA_TEST_PLAYWRIGHT);

const config = {redisContainer: process.env.POCKETDATA_ACCEPTANCE_REDIS_CONTAINER, redisNetwork: process.env.POCKETDATA_ACCEPTANCE_REDIS_NETWORK,
  phNetwork: process.env.POCKETDATA_ACCEPTANCE_PH_NETWORK, image: process.env.POCKETDATA_ACCEPTANCE_IMAGE};
assert.equal(config.redisContainer, 'pockethive-redis-1'); assert.equal(config.redisNetwork, 'pockethive'); assert.equal(config.phNetwork, 'pp-ph-integration');
assert.ok(config.image);
const identity = 'pd-ph-qa-' + Date.now() + '-' + randomUUID().slice(0, 8);
const resources = new CirculationResources(identity, config);
const artifacts = process.env.POCKETDATA_TEST_ARTIFACTS;
assert.ok(artifacts && path.isAbsolute(artifacts)); fs.mkdirSync(artifacts, {recursive: true});
const gateway = execFileSync('docker', ['network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}'], {encoding: 'utf8'}).trim();
assert.match(gateway, /^\d+\.\d+\.\d+\.\d+$/);
const calls = [];
const mockErrors = [];
let delayed = false;
let account = 0;
const mock = http.createServer((request, response) => {
  handleMock(request, response).catch(failure => { mockErrors.push(failure.message); if (!response.headersSent) response.writeHead(500); response.end(); });
});
async function handleMock(request, response) {
  let body = ''; for await (const bytes of request) body += bytes;
  calls.push({path: request.url, body});
  if (request.url === '/accounts') {
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(JSON.parse(body).customer, '000customer');
    if (delayed) await pause(1500);
    response.writeHead(201, {'Content-Type': 'application/json'}); response.end(JSON.stringify({accountNumber: '000acc-' + (++account)})); return;
  }
  const version = request.url === '/cards12' ? 'http://www.w3.org/2003/05/soap-envelope' : 'http://schemas.xmlsoap.org/soap/envelope/';
  if (request.url === '/cards11' || request.url === '/cards12' || request.url === '/fault') {
    assert.ok(body.includes('<s:Envelope') && body.includes('<s:Body>') && body.includes(version), 'Request must be a full SOAP envelope');
    if (request.url === '/cards12') {
      assert.equal(request.headers['content-type'], 'application/soap+xml; charset=utf-8; action="urn:create-card"'); assert.equal(request.headers.soapaction, undefined);
    } else {
      assert.equal(request.headers['content-type'], 'text/xml; charset=utf-8'); assert.equal(request.headers.soapaction, '"urn:create-card"');
    }
    assert.match(body, /000acc-/);
    const result = request.url === '/fault' ? '<s:Fault><faultstring>synthetic-private-fault</faultstring></s:Fault>'
      : '<c:CreateCardResponse xmlns:c="urn:cards"><c:cardNumber>000card-' + request.url.slice(1) + '-' + account + '</c:cardNumber></c:CreateCardResponse>';
    response.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'});
    response.end('<s:Envelope xmlns:s="' + version + '"><s:Body>' + result + '</s:Body></s:Envelope>'); return;
  }
  response.writeHead(404); response.end();
}

function recipe(count = 2, fault = false) {
  const step = (name, route, kind, field) => ({name, endpoint: 'api', call: {
    profile: 'portable-v1', requires: kind === 'JSON' ? ['json_path', 'json_string'] : ['xml_path', 'xml_text', kind === 'SOAP12' ? 'soap12' : 'soap11'],
    request: {serviceId: 'synthetic', callId: name,
      protocol: 'HTTP', method: 'POST', pathTemplate: route, headersTemplate: kind === 'JSON' ? {'Content-Type': 'application/json'} : {},
      bodyTemplate: kind === 'JSON' ? '{"customer":{{ json_string(record.customer) }},"iteration":{{ params.iteration }}}' : '<s:Envelope xmlns:s="' + (kind === 'SOAP12' ? 'http://www.w3.org/2003/05/soap-envelope' : 'http://schemas.xmlsoap.org/soap/envelope/') + '"><s:Body><c:CreateCard xmlns:c="urn:cards"><c:accountNumber>{{ xml_text(record.accountNumber) }}</c:accountNumber></c:CreateCard></s:Body></s:Envelope>'},
    response: {kind, soapAction: kind === 'JSON' ? '' : 'urn:create-card', expectedStatus: kind === 'JSON' ? 201 : 200,
      extract: {[field]: kind === 'JSON' ? '/accountNumber' : '/soap:Envelope/soap:Body/c:CreateCardResponse/c:cardNumber'}, namespaces: kind === 'JSON' ? {} : {c: 'urn:cards'}}}});
  return {name: 'Synthetic JSON and SOAP creation', count, values: {customer: '000customer', extraField: 'retained-extra'}, params: {customer: 'independent-param'}, steps: [
    step('account', '/accounts', 'JSON', 'accountNumber'), step('card11', fault ? '/fault' : '/cards11', 'SOAP11', 'cardNumber11'),
    step('card12', '/cards12', 'SOAP12', 'cardNumber12')]};
}

(async () => {
  let browser;
  let page;
  let cleanup = false;
  const evidence = {identity, calls: 0, desktopForwardingVerified: false, operationalMutations: false};
  try {
    await new Promise(resolve => mock.listen(0, gateway, resolve));
    let {origin, imageId} = resources.start(); evidence.imageId = imageId;
    for (let attempt = 0; attempt < 90; attempt++) {
      try { if ((await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok) break; } catch {}
      if (attempt === 89) throw new Error('QA PD did not become healthy'); await pause(1000);
    }
    assert.deepEqual(await expectRequest(origin, null, 'GET', '/api/catalog', 200), {revision: 0, suts: []});
    browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}}); context.setDefaultTimeout(20000);
    const errors = [];
    const planner = await context.newPage(); planner.on('pageerror', error => errors.push(error.message));
    await planner.goto('http://localhost:8765/#/plan'); await deviceSignIn(planner, context, false);
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    let token;
    page.on('request', request => { if (new URL(request.url()).origin === origin && request.headers().authorization) token = request.headers().authorization.replace(/^Bearer /, ''); });
    await page.goto(origin + '/#/population'); await deviceSignIn(page, context, true); assert.ok(token);
    evidence.sharedPocketFamilySignIn = true;
    await expectRequest(origin, token, 'PUT', '/api/catalog', 200, {revision: 0, suts: [{id: identity, name: 'Synthetic SOAP population', description: identity,
      endpoints: {api: 'http://' + gateway + ':' + mock.address().port}}]});
    const format = {sutId: identity, name: 'cards', description: identity, fields: ['accountNumber', 'cardNumber11', 'cardNumber12'].map(name => ({name, type: 'string', required: true})), lists: ['ready', 'returned']};
    const base = '/api/suts/' + identity + '/datasets/cards';
    await expectRequest(origin, token, 'POST', '/api/suts/' + identity + '/datasets', 200, format);
    await page.reload(); await page.locator('#sut-select').selectOption(identity);
    await page.getByRole('combobox', {name: /^DataSet/}).selectOption('cards');
    async function start(source) {
      await page.locator('textarea.pd-population-script').fill(JSON.stringify(source, null, 2));
      await page.getByRole('button', {name: 'Run script…', exact: true}).click();
      const response = page.waitForResponse(value => value.url().includes(base + '/population?') && value.request().method() === 'POST');
      await page.getByRole('button', {name: 'Confirm Run', exact: true}).click();
      const accepted = await response; assert.equal(accepted.status(), 202); return accepted.json();
    }
    const inadmissible = recipe(1);
    inadmissible.steps[2].call.requires.push('unsupported-capability');
    const beforeRejection = calls.length;
    assert.equal(beforeRejection, 0);
    const rejected = await expectRequest(origin, token, 'POST', base + '/population?list=ready', 400, inadmissible);
    assert.match(rejected.error, /Invalid portable call:/);
    assert.equal(calls.length, beforeRejection, 'A later unsupported capability must reject the whole recipe before any SUT request');
    await pause(500);
    assert.equal(calls.length, beforeRejection, 'Rejected recipes must not start asynchronous SUT requests');
    assert.equal(resources.redis('LLEN', resources.keys[1]), '0');
    evidence.unsupportedCapabilityRejectedBeforeSutEffects = true;
    console.log('PASS actual authenticated API rejects an unsupported later-step capability before any SUT effects');

    const accepted = await start(recipe());
    await page.getByRole('heading', {name: 'SUCCEEDED', exact: true}).waitFor({timeout: 30000});
    const successful = await expectRequest(origin, token, 'GET', base + '/population/' + accepted.id, 200);
    assert.equal(successful.completed, 2); assert.equal(successful.published, 2); assert.equal(calls.length, 6);
    const rows = resources.redis('LRANGE', resources.keys[1], '0', '9').split('\n').filter(Boolean).map(row => JSON.parse(row));
    assert.equal(rows.length, 2);
    for (const row of rows) { assert.match(row.accountNumber, /^000acc-/); assert.match(row.cardNumber11, /^000card-cards11-/); assert.match(row.cardNumber12, /^000card-cards12-/); assert.equal(row.extraField, 'retained-extra'); }
    const csv = await expectRequest(origin, token, 'GET', base + '/inventory/' + accepted.id, 200); assert.match(csv, /000acc-/);
    await expectRequest(origin, null, 'GET', base + '/population/' + accepted.id + '/responses', 401);
    const download = page.waitForEvent('download'); await page.getByRole('button', {name: 'Download response CSV', exact: true}).click();
    const audit = fs.readFileSync(await (await download).path(), 'utf8'); assert.match(audit, /000acc-/); assert.match(audit, /CreateCardResponse/);
    await page.screenshot({path: path.join(artifacts, 'population-soap-success.png'), fullPage: true});
    await page.getByRole('heading', {name: 'Scripted population', exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(artifacts, 'population-desktop.png')});
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(artifacts, 'population-mobile.png')});
    await page.setViewportSize({width: 1440, height: 1000});
    console.log('PASS actual shared PH auth, UI Run, JSON -> SOAP11 -> SOAP12, durable CSV and existing PH Redis');

    const failed = await start(recipe(3, true));
    await page.getByRole('heading', {name: 'FAILED', exact: true}).waitFor({timeout: 30000});
    const failure = await expectRequest(origin, token, 'GET', base + '/population/' + failed.id, 200);
    assert.equal(failure.completed, 0); assert.equal(failure.published, 0); assert.equal(calls.length, 8); assert.equal(resources.redis('LLEN', resources.keys[1]), '2');
    assert.ok(!failure.error.includes('synthetic-private-fault'));
    assert.match(await expectRequest(origin, token, 'GET', base + '/population/' + failed.id + '/responses', 200), /000acc-/);
    await pause(500); assert.equal(calls.length, 8);
    console.log('PASS HTTP200 SOAP Fault stops later steps, keeps created-resource evidence and never retries/publishes partial records');

    delayed = true; const beforeStop = calls.length;
    const stopping = await start(recipe(3));
    for (let attempt = 0; calls.length === beforeStop && attempt < 100; attempt++) await pause(20);
    assert.equal(calls.length, beforeStop + 1);
    await page.getByRole('button', {name: 'Stop', exact: true}).click();
    await page.getByRole('heading', {name: 'STOPPED', exact: true}).waitFor({timeout: 20000});
    assert.equal(calls.length, beforeStop + 1); assert.equal(resources.redis('LLEN', resources.keys[1]), '2');
    assert.match(await expectRequest(origin, token, 'GET', base + '/population/' + stopping.id + '/responses', 200), /000acc-/);
    console.log('PASS UI Stop retains the in-flight response without starting another resource request');
    const originBeforeRestart = origin;
    execFileSync('docker', ['restart', '--time', '15', identity], {stdio: 'pipe'});
    const restarted = resources.inspect(identity);
    assert.equal(restarted.State.Running, true);
    const binding = restarted.NetworkSettings.Ports['8785/tcp'];
    assert.equal(binding.length, 1); assert.equal(binding[0].HostIp, '127.0.0.1');
    origin = 'http://localhost:' + binding[0].HostPort;
    let healthy = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try { healthy = (await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
      if (healthy) break;
      await pause(500);
    }
    assert.equal(healthy, true, 'QA PD must become healthy at its actual post-restart port');
    await page.goto(origin + '/#/population');
    if (origin !== originBeforeRestart) await deviceSignIn(page, context, true);
    await page.getByRole('button', {name: 'local-admin · Sign out', exact: true}).waitFor();
    assert.equal(await expectRequest(origin, token, 'GET', base + '/inventory/' + accepted.id, 200), csv);
    assert.match(await expectRequest(origin, token, 'GET', base + '/population/' + failed.id + '/responses', 200), /000acc-/);
    await expectRequest(origin, token, 'GET', base + '/population/' + accepted.id, 404);
    assert.equal(calls.length, beforeStop + 1); assert.equal(calls.length, 9); evidence.populationRestartPersistence = true;
    evidence.originBeforeRestart = originBeforeRestart; evidence.originAfterRestart = origin;
    console.log('PASS real PD restart preserves both CSVs and shared login, without resuming jobs');
    assert.deepEqual(errors, []); assert.deepEqual(mockErrors, []); evidence.pageErrors = errors.length; evidence.passed = true;
  } catch (failure) {
    if (page) await page.screenshot({path: path.join(artifacts, 'population-failure.png'), fullPage: true}).catch(() => {});
    console.error(failure.message); process.exitCode = 1; evidence.error = failure.message;
  } finally {
    if (browser) await browser.close();
    mock.closeAllConnections(); if (mock.listening) await new Promise(resolve => mock.close(resolve));
    try { resources.cleanup(); cleanup = true; } catch (failure) { console.error('Owned QA cleanup: ' + failure.message); process.exitCode = 1; }
    evidence.calls = calls.length; evidence.cleanupVerified = cleanup; fs.writeFileSync(path.join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
