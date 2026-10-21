const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {createHash, randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {setTimeout: pause} = require('node:timers/promises');
const {request, expectRequest, lifecycle} = require('./support/ph-redis-api.cjs');
const {portableBundle} = require('./support/ph-portable-bundle.cjs');

const hive = process.env.POCKETDATA_ACCEPTANCE_PH_ORIGIN;
assert.equal(hive, 'http://localhost:8089', 'Use the explicitly approved official ingress');
assert.equal(process.env.POCKETDATA_ACCEPTANCE_AUTH_USER, 'local-admin');
const network = process.env.POCKETDATA_ACCEPTANCE_PH_NETWORK;
assert.equal(network, 'pp-ph-integration');
const source = process.env.POCKETDATA_ACCEPTANCE_PH_SOURCE;
assert.ok(source && path.isAbsolute(source), 'Select the actual PH fixture source explicitly');
const identity = 'pd-ph-soap-' + Date.now() + '-' + randomUUID().slice(0, 8);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), identity + '-'));
const evidenceFile = path.join(directory, 'evidence.json');
const evidence = {identity, ingress: hive, cases: [], cleanupErrors: [], operationalDataTouched: false};
const owned = [];
const mockErrors = [];
const cases = [
  {name: 'soap11', version: 'SOAP11', number: ' 000011 '},
  {name: 'soap12', version: 'SOAP12', number: ' 000012 '},
  {name: 'fault200', version: 'SOAP11', fault: true}
].map(test => ({...test, identity: identity + '-' + test.name, calls: []}));
const seed = {accountNumber: '000123 & <é>', customerId: '000007', unused: identity, count: 7, active: true};
const params = {productClass: 'gold & "plus"'};
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8', timeout: 45000}).trim();
const save = () => fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
let token;

const mock = http.createServer((incoming, response) => {
  handleMock(incoming, response).catch(failure => {
    mockErrors.push(failure.message);
    if (!response.headersSent) response.writeHead(500);
    response.end('Synthetic mock assertion failed');
  });
});

async function handleMock(incoming, response) {
  const test = cases.find(candidate => incoming.url === '/' + candidate.identity);
  assert.ok(test, 'Unexpected request to the owned mock: ' + incoming.url);
  const chunks = [];
  let size = 0;
  for await (const bytes of incoming) {
    size += bytes.length;
    assert.ok(size <= 65536, 'Owned mock request exceeded portable output limit');
    chunks.push(bytes);
  }
  const body = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
  test.calls.push({method: incoming.method, path: incoming.url, body,
    contentType: incoming.headers['content-type'], soapAction: incoming.headers.soapaction});
  assert.equal(incoming.method, 'POST');
  assert.equal(incoming.headers.authorization, undefined);
  assert.equal(incoming.headers.cookie, undefined);
  const namespace = test.version === 'SOAP11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
  assert.equal(body, '<s:Envelope xmlns:s="' + namespace + '"><s:Body><c:CreateCard xmlns:c="urn:cards" class="gold &amp; &quot;plus&quot;"><c:accountNumber>000123 &amp; &lt;é&gt;</c:accountNumber></c:CreateCard></s:Body></s:Envelope>');
  if (test.version === 'SOAP11') {
    assert.equal(incoming.headers['content-type'], 'text/xml; charset=utf-8');
    assert.equal(incoming.headers.soapaction, '"urn:create-card"');
  } else {
    assert.equal(incoming.headers['content-type'], 'application/soap+xml; charset=utf-8; action="urn:create-card"');
    assert.equal(incoming.headers.soapaction, undefined);
  }
  const content = test.fault ? '<different:Fault><faultcode>different:Server</faultcode><faultstring>synthetic-private-fault</faultstring></different:Fault>'
    : '<changed:CreateCardResponse xmlns:changed="urn:cards"><changed:cardNumber>' + test.number + '</changed:cardNumber></changed:CreateCardResponse>';
  response.writeHead(200, {'Content-Type': test.version === 'SOAP11' ? 'text/xml; charset=utf-8' : 'application/soap+xml; charset=utf-8'});
  response.end('<different:Envelope xmlns:different="' + namespace + '"><different:Body>' + content + '</different:Body></different:Envelope>');
}

async function ready() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const result = await request(hive, null, 'GET', '/orchestrator/actuator/health');
      const scenarios = await request(hive, null, 'GET', '/scenario-manager/actuator/health');
      const auth = await request(hive, null, 'GET', '/auth-service/api/auth/me');
      if (result.status === 200 && result.body.status === 'UP' && scenarios.status === 200
        && scenarios.body.status === 'UP' && auth.status === 401) return;
    } catch {}
    await pause(1000);
  }
  throw new Error('Approved official ingress is not ready; no stack rebuild or direct-port bypass was attempted');
}

async function captureTap(test, tapId, messages) {
  const result = await expectRequest(hive, token, 'GET', '/orchestrator/api/debug/taps/' + tapId, 200);
  assert.equal(result.tapId, tapId);
  assert.equal(result.swarmId, test.identity);
  for (const sample of result.samples) {
    const item = JSON.parse(sample.payload);
    messages.set(item.messageId, item);
  }
}

async function capture(test) {
  await captureTap(test, test.inputTapId, test.submissions);
  await captureTap(test, test.tapId, test.messages);
  test.evidence.submissions = [...test.submissions.values()];
  test.evidence.capturedMessages = [...test.messages.values()];
  save();
}

async function runtimeResources(test) {
  const result = await expectRequest(hive, token, 'POST', '/orchestrator/api/runtime/debug/resources/list', 200, {
    swarmId: test.identity, runId: test.runId, includeManagers: true
  });
  assert.equal(result.swarmId, test.identity);
  assert.equal(result.blocked.length, 0, 'Owned runtime inventory contains blocked resources');
  const resources = [...result.workers, ...result.managers];
  for (const resource of resources) {
    assert.equal(resource.swarmId, test.identity);
    if (test.runId) assert.equal(resource.runId, test.runId);
  }
  return resources;
}

async function diagnostics(test) {
  const current = await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity);
  if (current.status === 200) {
    assert.equal(current.body.templateId, test.identity);
    if (test.runId) assert.equal(current.body.runId, test.runId);
    else test.runId = current.body.runId;
  }
  const report = {swarm: current, runId: test.runId};
  if (test.runId) report.journal = await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity
    + '/journal/page?runId=' + encodeURIComponent(test.runId) + '&limit=100');
  report.resources = await runtimeResources(test);
  report.logs = [];
  for (const resource of report.resources) {
    const result = await request(hive, token, 'POST', '/orchestrator/api/runtime/debug/resources/logs', {
      swarmId: test.identity, runId: test.runId, runtimeId: resource.runtimeId,
      resourceKind: resource.resourceKind, tailLines: 160
    });
    report.logs.push(result);
    if (result.status === 200) console.error('OWNED ' + resource.role + ' diagnostic: '
      + result.body.logs.split('\n').filter(line => /ERROR|Exception|failed|Failed|Invalid|invalid|Caused by/.test(line)).slice(-12).join('\n'));
  }
  const destination = path.join(directory, test.name, 'diagnostics.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  test.evidence.diagnosticsFile = destination;
  save();
}

async function runCase(test, gateway, port) {
  const fixturePath = path.join(source, 'common/request-templates/src/main/resources/portable/examples/card-' + test.version.toLowerCase() + '.json');
  const fixture = fs.readFileSync(fixturePath);
  const bundle = portableBundle(path.join(directory, test.name), test.identity,
    'http://' + gateway + ':' + port + '/' + test.identity, fixture, seed, params, test.fault);
  test.description = bundle.description;
  test.messages = new Map();
  test.submissions = new Map();
  const details = {name: test.name, swarmId: test.identity, workTransport: 'ARTEMIS', fixture: fixturePath,
    fixtureSha256: createHash('sha256').update(fixture).digest('hex')};
  evidence.cases.push(details);
  test.evidence = details;
  assert.equal((await request(hive, token, 'GET', '/scenario-manager/scenarios/' + test.identity)).status, 404);
  assert.equal((await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity)).status, 404);
  const validation = await expectRequest(hive, token, 'POST', '/scenario-manager/validation/scenario-bundles', 200, bundle.archive, 'application/zip');
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(validation.scenarioId, test.identity);
  details.validation = validation;
  owned.push(test);
  test.scenarioAttempted = true;
  const published = await expectRequest(hive, token, 'POST', '/scenario-manager/scenarios/bundles', 201, bundle.archive, 'application/zip');
  assert.equal(published.id, test.identity);
  save();
  console.log('RUN validated/published ' + test.name + ': ' + test.identity);
  test.swarmAttempted = true;
  const created = await lifecycle(hive, token, test.identity, 'create', {
    templateId: test.identity, autoPullImages: false, sutId: 'portable-local', variablesProfileId: null,
    networkMode: 'DIRECT', networkProfileId: null
  });
  test.runId = created.runtime.runId;
  assert.ok(test.runId);
  details.runId = test.runId;
  const resources = await runtimeResources(test);
  assert.ok(resources.length >= 3);
  details.images = resources.map(resource => ({role: resource.role, image: resource.image, imageDigest: resource.imageDigest}));
  assert.ok(details.images.some(image => image.role === 'http-sequence'));
  const tap = await expectRequest(hive, token, 'POST', '/orchestrator/api/debug/taps', 200, {
    swarmId: test.identity, role: 'http-sequence', direction: 'OUT', ioName: 'out', maxItems: 4, ttlSeconds: 180
  });
  assert.equal(tap.swarmId, test.identity);
  test.tapId = tap.tapId;
  assert.ok(test.tapId);
  const inputTap = await expectRequest(hive, token, 'POST', '/orchestrator/api/debug/taps', 200, {
    swarmId: test.identity, role: 'http-sequence', direction: 'IN', ioName: 'in', maxItems: 4, ttlSeconds: 180
  });
  assert.equal(inputTap.swarmId, test.identity);
  test.inputTapId = inputTap.tapId;
  assert.ok(test.inputTapId);
  test.startAttempted = true;
  await lifecycle(hive, token, test.identity, 'start');
  const deadline = Date.now() + 60000;
  let faultEvent;
  while (Date.now() < deadline) {
    assert.deepEqual(mockErrors, []);
    await capture(test);
    if (!test.fault && test.messages.size) break;
    if (test.fault && test.calls.length) {
      const journal = await expectRequest(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity
        + '/journal/page?runId=' + encodeURIComponent(test.runId) + '&severity=ERROR&limit=50', 200);
      faultEvent = journal.items.find(event => JSON.stringify(event).includes('http-sequence')
        && JSON.stringify(event).includes('SOAP response contains a Fault'));
      if (faultEvent) {
        assert.equal(faultEvent.swarmId, test.identity);
        if (faultEvent.runId !== undefined) assert.equal(faultEvent.runId, test.runId);
        break;
      }
    }
    await pause(500);
  }
  if (test.fault) {
    assert.ok(faultEvent, 'Actual HTTP Sequence SOAP Fault failure was not journaled for this exact run');
    details.faultEvent = faultEvent;
    assert.ok(!JSON.stringify(faultEvent).includes('synthetic-private-fault'));
  } else {
    assert.equal(test.messages.size, 1, 'Exactly one real HTTP Sequence output is required');
    const item = [...test.messages.values()][0];
    assert.equal(item.observability.swarmId, test.identity);
    assert.equal(item.steps[0].payload, '', 'Original scheduler history must be unchanged');
    const generated = item.steps.filter(step => step.headers['ph.step.service'] === 'generator');
    assert.equal(generated.length, 2, 'Scheduler seed and generated payload are separate history steps');
    assert.equal(generated[0].payload, '');
    assert.equal(generated[1].payload, JSON.stringify(seed), 'Original opaque generated seed must be unchanged');
    const steps = item.steps.filter(step => step.headers['ph.step.service'] === 'http-sequence');
    assert.equal(steps.length, 1);
    assert.deepEqual(JSON.parse(steps[0].payload), {...seed, cardNumber: test.number});
    assert.equal(steps[0].headers['x-ph-http-seq-status'], 200);
    assert.equal(steps[0].headers['x-ph-http-seq-attempts'], 1);
    details.output = item;
  }
  await pause(3000);
  await capture(test);
  assert.equal(test.submissions.size, 1, 'The finite scheduler must submit exactly one journey');
  const submitted = [...test.submissions.values()][0];
  assert.equal(submitted.headers['x-ph-seq'], 1);
  assert.equal(submitted.headers['x-ph-scheduler-remaining'], 0);
  assert.equal(submitted.steps.at(-1).payload, JSON.stringify(seed));
  if (!test.fault) assert.equal([...test.messages.keys()][0], submitted.messageId);
  assert.equal(test.calls.length, 1, 'A one-message journey must not retry or execute the step after a Fault');
  assert.equal(test.messages.size, test.fault ? 0 : 1);
  assert.deepEqual(mockErrors, []);
  const snapshot = await expectRequest(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity, 200);
  assert.equal(snapshot.runId, test.runId);
  details.requests = test.calls;
  details.passed = true;
  save();
  console.log('PASS real PH ' + test.name + ', exact run ' + test.runId + ', one request, '
    + (test.fault ? 'journaled HTTP200 Fault, no retry/next step/output' : 'extracted leading-zero/whitespace string and preserved history'));
}

async function cleanup(test) {
  const attempt = async action => {
    try { await action(); } catch (failure) { evidence.cleanupErrors.push(test.identity + ': ' + failure.message); }
  };
  if (test.swarmAttempted) await attempt(async () => {
    const current = await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity);
    if (current.status === 404) return;
    assert.equal(current.status, 200);
    assert.equal(current.body.id, test.identity);
    assert.equal(current.body.templateId, test.identity);
    if (test.runId) assert.equal(current.body.runId, test.runId);
    if (test.startAttempted) await lifecycle(hive, token, test.identity, 'stop');
  });
  for (const tapId of [test.tapId, test.inputTapId].filter(Boolean)) await attempt(async () => {
    await expectRequest(hive, token, 'DELETE', '/orchestrator/api/debug/taps/' + tapId, 200);
    assert.equal((await request(hive, token, 'GET', '/orchestrator/api/debug/taps/' + tapId + '?drain=0')).status, 404);
  });
  if (test.swarmAttempted) await attempt(async () => {
    const current = await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity);
    if (current.status === 200) {
      assert.equal(current.body.id, test.identity);
      assert.equal(current.body.templateId, test.identity);
      if (test.runId) assert.equal(current.body.runId, test.runId);
      await lifecycle(hive, token, test.identity, 'remove');
    } else assert.equal(current.status, 404);
    assert.equal((await runtimeResources(test)).length, 0, 'Owned runtime containers remain');
    assert.equal((await request(hive, token, 'GET', '/orchestrator/api/swarms/' + test.identity)).status, 404);
  });
  if (test.scenarioAttempted) await attempt(async () => {
    assert.equal((await runtimeResources(test)).length, 0, 'Do not remove a scenario while its runtime remains');
    const current = await request(hive, token, 'GET', '/scenario-manager/scenarios/' + test.identity);
    if (current.status === 200) {
      assert.equal(current.body.id, test.identity);
      assert.equal(current.body.description, test.description);
      await expectRequest(hive, token, 'DELETE', '/scenario-manager/scenarios/' + test.identity, 204);
    } else assert.equal(current.status, 404);
  });
}

(async () => {
  try {
    await ready();
    const selected = JSON.parse(docker('network', 'inspect', network))[0];
    assert.equal(selected.Name, network);
    assert.equal(selected.Driver, 'bridge');
    assert.equal(selected.IPAM.Config.length, 1);
    const gateway = selected.IPAM.Config[0].Gateway;
    assert.match(gateway, /^\d+\.\d+\.\d+\.\d+$/);
    await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(0, gateway, resolve); });
    evidence.mockOrigin = 'http://' + gateway + ':' + mock.address().port;
    const login = await expectRequest(hive, null, 'POST', '/auth-service/api/auth/dev/login', 200, {username: 'local-admin'});
    token = login.accessToken;
    assert.ok(token);
    await expectRequest(hive, token, 'GET', '/orchestrator/api/runtime/debug/capabilities', 200);
    console.log('EVIDENCE ' + evidenceFile);
    for (const test of cases) await runCase(test, gateway, mock.address().port);
    evidence.passed = true;
  } catch (failure) {
    evidence.passed = false;
    evidence.failure = failure.stack;
    console.error(failure.stack);
    process.exitCode = 1;
    for (const test of owned) {
      try { await diagnostics(test); } catch (diagnosticFailure) { evidence.diagnosticError = diagnosticFailure.message; }
    }
  } finally {
    for (const test of [...owned].reverse()) await cleanup(test);
    mock.closeAllConnections();
    if (mock.listening) await new Promise(resolve => mock.close(resolve));
    evidence.calls = cases.map(test => ({name: test.name, calls: test.calls}));
    evidence.mockErrors = mockErrors;
    evidence.cleanupVerified = evidence.cleanupErrors.length === 0;
    if (!evidence.cleanupVerified) process.exitCode = 1;
    save();
    console.log(JSON.stringify({passed: evidence.passed, identity, evidenceFile,
      cleanupVerified: evidence.cleanupVerified, cleanupErrors: evidence.cleanupErrors}, null, 2));
  }
})().catch(failure => { console.error(failure.stack); process.exitCode = 1; });
