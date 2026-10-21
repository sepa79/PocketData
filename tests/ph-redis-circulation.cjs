const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {setTimeout: pause} = require('node:timers/promises');
const {redisBundle} = require('./support/ph-redis-bundle.cjs');
const {CirculationResources} = require('./support/ph-redis-resources.cjs');
const {request, expectRequest, lifecycle} = require('./support/ph-redis-api.cjs');

const hive = process.env.POCKETDATA_ACCEPTANCE_PH_ORIGIN;
assert.match(hive || '', /^http:\/\/localhost:\d+$/, 'Explicit official local PH ingress required');
assert.equal(process.env.POCKETDATA_ACCEPTANCE_AUTH_USER, 'local-admin');
const config = {
  redisContainer: process.env.POCKETDATA_ACCEPTANCE_REDIS_CONTAINER,
  redisNetwork: process.env.POCKETDATA_ACCEPTANCE_REDIS_NETWORK,
  phNetwork: process.env.POCKETDATA_ACCEPTANCE_PH_NETWORK,
  image: process.env.POCKETDATA_ACCEPTANCE_IMAGE
};
for (const value of Object.values(config)) assert.match(value || '', /^[a-zA-Z0-9_.:/-]+$/, 'Explicit local resource selection required');
assert.equal(config.redisContainer, 'pockethive-redis-1');
assert.equal(config.redisNetwork, 'pockethive');
assert.equal(config.phNetwork, 'pp-ph-integration');
const identity = 'pd-ph-qa-' + Date.now() + '-' + randomUUID().slice(0, 8);
const resources = new CirculationResources(identity, config);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), identity + '-'));
const evidence = {identity, redisContainer: config.redisContainer, keys: resources.keys, steps: []};
const evidenceFile = path.join(directory, 'evidence.json');
const record = (step, details = {}) => {
  evidence.steps.push({step, ...details});
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
  console.log('PASS ' + step + ' ' + JSON.stringify(details));
};

(async () => {
  let token;
  let scenarioOwned = false;
  let swarmAttempted = false;
  let runId;
  let tapId;
  let started = false;
  let origin;
  try {
    const local = resources.start();
    origin = local.origin;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok) break; }
      catch (failure) { if (attempt === 59) throw failure; }
      await pause(1000);
    }
    const catalog = await expectRequest(origin, null, 'GET', '/api/catalog', 200);
    assert.deepEqual(catalog, {revision: 0, suts: []}, 'Never mutate a nonempty PocketData workspace');
    const login = await expectRequest(hive, null, 'POST', '/auth-service/api/auth/dev/login', 200, {username: 'local-admin'});
    token = login.accessToken;
    assert.ok(token);
    const session = await expectRequest(origin, token, 'GET', '/api/session', 200);
    assert.equal(session.canEdit, true);
    record('isolated PD with real PH identity and existing PH Redis', {origin, imageId: local.imageId});

    await expectRequest(origin, token, 'PUT', '/api/catalog', 200, {revision: 0, suts: [{
      id: identity, name: 'Synthetic PD / PH circulation', description: identity,
      endpoints: {default: 'http://wiremock:8080'}
    }]});
    const format = {sutId: identity, name: 'cards', description: identity,
      fields: [{name: 'accountNumber', type: 'string', required: true}], lists: ['ready', 'returned']};
    await expectRequest(origin, token, 'POST', '/api/suts/' + identity + '/datasets', 200, format);
    assert.deepEqual(JSON.parse(resources.redis('GET', resources.keys[0])), format);
    record('PD format is visible in the selected existing PH Redis');

    const archive = redisBundle(directory, identity, config.redisContainer, resources.keys[1], resources.keys[2]);
    const validation = await expectRequest(hive, token, 'POST', '/scenario-manager/validation/scenario-bundles', 200, archive, 'application/zip');
    assert.equal(validation.ok, true, JSON.stringify(validation));
    assert.equal(validation.scenarioId, identity);
    assert.equal((await request(hive, token, 'GET', '/scenario-manager/scenarios/' + identity)).status, 404,
      'Never replace an existing scenario');
    scenarioOwned = true;
    const published = await expectRequest(hive, token, 'POST', '/scenario-manager/scenarios/bundles', 201, archive, 'application/zip');
    assert.equal(published.id, identity);
    const sut = await expectRequest(hive, token, 'GET', '/scenario-manager/scenarios/' + identity + '/suts/wiremock-local', 200);
    assert.equal(sut.endpoints.default.baseUrl, 'http://wiremock:8080');
    record('canonical PH validation and publication of exact owned local-mock scenario', {artifactDigest: validation.validation.artifactDigest});

    assert.equal((await request(hive, token, 'GET', '/orchestrator/api/swarms/' + identity)).status, 404,
      'Never reuse an existing swarm');
    swarmAttempted = true;
    const created = await lifecycle(hive, token, identity, 'create', {
      templateId: identity, autoPullImages: false, sutId: 'wiremock-local', variablesProfileId: null,
      networkMode: 'DIRECT', networkProfileId: null
    });
    runId = created.runtime.runId;
    assert.ok(runId);
    resources.attachOwnedWorkers(runId);
    record('real PH CREATE and explicit network attachment of owned Redis workers only', {runId});
    const tap = await expectRequest(hive, token, 'POST', '/orchestrator/api/debug/taps', 200, {
      swarmId: identity, role: 'processor', direction: 'OUT', ioName: 'out', maxItems: 6, ttlSeconds: 180
    });
    tapId = tap.tapId;
    assert.equal(tap.swarmId, identity);
    assert.ok(tapId);
    await lifecycle(hive, token, identity, 'start');
    started = true;
    await pause(4000);
    const waiting = await expectRequest(hive, token, 'GET', '/orchestrator/api/swarms/' + identity, 200);
    assert.equal(waiting.workloadState, 'RUNNING');
    assert.equal(resources.redis('LLEN', resources.keys[1]), '0');
    assert.equal(resources.redis('LLEN', resources.keys[2]), '0');
    const emptyCapture = await expectRequest(hive, token, 'GET', '/orchestrator/api/debug/taps/' + tapId, 200);
    assert.deepEqual(emptyCapture.samples, []);
    record('running PH generator waits on an empty pool without fabricated requests');

    const rows = [1, 2, 3].map(index => ({accountNumber: '000' + index, customer: 'qa-only', extra: identity + '-' + index}));
    const csv = 'accountNumber,customer,extra\n' + rows.map(row => Object.values(row).join(',')).join('\n') + '\n';
    const imported = await expectRequest(origin, token, 'POST', '/api/suts/' + identity + '/datasets/cards/import?list=ready', 200, csv, 'text/csv');
    assert.equal(imported.rows, 3);
    assert.equal(imported.published, 3);
    const savedCsv = await expectRequest(origin, token, 'GET', '/api/suts/' + identity + '/datasets/cards/inventory/' + imported.id, 200);
    assert.equal(savedCsv, csv);
    record('live CSV publication from isolated PD with durable exact inventory', {rows: imported.rows, inventoryId: imported.id});

    const captures = new Map();
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const capture = await expectRequest(hive, token, 'GET', '/orchestrator/api/debug/taps/' + tapId, 200);
      assert.equal(capture.tapId, tapId);
      for (const sample of capture.samples) {
        const item = JSON.parse(sample.payload);
        captures.set(item.messageId, item);
      }
      if (captures.size === 3 && resources.redis('LLEN', resources.keys[2]) === '3') break;
      await pause(500);
    }
    assert.equal(captures.size, 3, 'Actual PH processor outcomes were not captured');
    const outcomes = [];
    const observedAccounts = new Set();
    for (const item of captures.values()) {
      const payload = item.steps.at(-1).payload;
      const result = typeof payload === 'string' ? JSON.parse(payload) : payload;
      assert.equal(result.outcome.type, 'http_response');
      assert.equal(result.outcome.status, 200);
      assert.equal(result.outcome.error, null);
      const original = JSON.parse(item.steps[0].payload);
      assert.ok(rows.some(row => JSON.stringify(row) === JSON.stringify(original)));
      assert.ok(!observedAccounts.has(original.accountNumber), 'Duplicate record in actual processor capture');
      observedAccounts.add(original.accountNumber);
      const built = item.steps.filter(step => step.headers['ph.step.service'] === 'request-builder');
      assert.equal(built.length, 1);
      const envelope = JSON.parse(built[0].payload);
      assert.equal(envelope.kind, 'http.request');
      assert.equal(envelope.request.method, 'POST');
      assert.equal(envelope.request.path, '/api/test');
      assert.deepEqual(typeof envelope.request.body === 'string' ? JSON.parse(envelope.request.body) : envelope.request.body, original);
      outcomes.push({messageId: item.messageId, status: result.outcome.status, accountNumber: original.accountNumber});
    }
    assert.equal(resources.redis('LLEN', resources.keys[1]), '0');
    assert.equal(resources.redis('LLEN', resources.keys[2]), '3');
    const returned = resources.redis('LRANGE', resources.keys[2], '0', '9').split('\n').map(value => JSON.parse(value));
    assert.deepEqual(returned.sort((left, right) => left.accountNumber.localeCompare(right.accountNumber)), rows);
    const visible = await expectRequest(origin, null, 'GET', '/api/suts/' + identity + '/datasets', 200);
    assert.deepEqual(visible[0].counts, {ready: 0, returned: 3});
    record('real PH pop / request template / HTTP 200 / postprocessor Redis return', {outcomes, returnedRecords: 3, extraFieldsPreserved: true});
    started = false;
    await lifecycle(hive, token, identity, 'stop');
    evidence.passed = true;
  } catch (failure) {
    evidence.passed = false;
    evidence.failure = failure.message;
    console.error(failure.stack);
    process.exitCode = 1;
  } finally {
    let cleanupVerified = true;
    const cleanupErrors = [];
    const clean = async (action) => {
      try { await action(); } catch (failure) { cleanupVerified = false; cleanupErrors.push(failure.message); }
    };
    if (tapId) await clean(async () => {
      await expectRequest(hive, token, 'DELETE', '/orchestrator/api/debug/taps/' + tapId, 200);
      assert.equal((await request(hive, token, 'GET', '/orchestrator/api/debug/taps/' + tapId + '?drain=0')).status, 404);
    });
    if (started) await clean(() => lifecycle(hive, token, identity, 'stop'));
    if (swarmAttempted) await clean(async () => {
      const current = await request(hive, token, 'GET', '/orchestrator/api/swarms/' + identity);
      if (current.status === 200) {
        if (runId) assert.equal(current.body.runId, runId);
        assert.equal(current.body.templateId, identity);
        await lifecycle(hive, token, identity, 'remove');
      } else assert.equal(current.status, 404);
      assert.equal(resources.ownedWorkerCount(), 0, 'Owned runtime cleanup unconfirmed');
    });
    if (scenarioOwned) await clean(async () => {
      assert.equal(resources.ownedWorkerCount(), 0, 'Keep scenario while owned runtime remains');
      const current = await request(hive, token, 'GET', '/scenario-manager/scenarios/' + identity);
      if (current.status === 200) {
        assert.equal(current.body.id, identity);
        assert.equal(current.body.description, 'Owned synthetic PocketData Redis circulation acceptance; local WireMock only.');
        await expectRequest(hive, token, 'DELETE', '/scenario-manager/scenarios/' + identity, 204);
      } else assert.equal(current.status, 404);
    });
    await clean(async () => resources.cleanup());
    evidence.cleanupVerified = cleanupVerified;
    evidence.cleanupErrors = cleanupErrors;
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
    if (!cleanupVerified) { console.error('Exact owned resources need attention: ' + JSON.stringify(cleanupErrors)); process.exitCode = 1; }
    console.log(JSON.stringify({passed: evidence.passed, identity, evidenceFile, cleanupVerified, operationalCopies: false, sharedServiceRestarts: false}, null, 2));
  }
})();
