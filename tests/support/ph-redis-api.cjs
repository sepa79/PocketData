const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {setTimeout: pause} = require('node:timers/promises');

async function request(origin, token, method, endpoint, body, contentType = 'application/json') {
  const response = await fetch(origin + endpoint, {
    method, signal: AbortSignal.timeout(15000),
    headers: {Accept: 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {}),
      ...(body !== undefined ? {'Content-Type': contentType} : {})},
    ...(body !== undefined ? {body: contentType === 'application/json' ? JSON.stringify(body) : body} : {})
  });
  const text = await response.text();
  const value = response.headers.get('Content-Type')?.includes('json') && text ? JSON.parse(text) : text;
  return {status: response.status, body: value};
}

async function expectRequest(origin, token, method, endpoint, expected, body, contentType) {
  const result = await request(origin, token, method, endpoint, body, contentType);
  assert.equal(result.status, expected, method + ' ' + endpoint + ': ' + JSON.stringify(result.body));
  return result.body;
}

async function lifecycle(origin, token, identity, action, body) {
  const accepted = await expectRequest(origin, token, 'POST',
    '/orchestrator/api/swarms/' + identity + '/' + action, 202, {idempotencyKey: randomUUID(), ...body});
  assert.ok(accepted.correlationId && accepted.idempotencyKey, 'Missing canonical operation identity');
  const deadline = Date.now() + Math.min((accepted.timeoutMs || 180000) + 15000, 315000);
  while (Date.now() < deadline) {
    const operation = await expectRequest(origin, token, 'GET',
      '/orchestrator/api/swarms/' + identity + '/operations/' + accepted.correlationId, 200);
    assert.equal(operation.swarmId, identity);
    assert.equal(operation.correlationId, accepted.correlationId);
    if (!['ACCEPTED', 'DISPATCHED'].includes(operation.state)) {
      assert.equal(operation.state, 'SUCCEEDED', action + ': ' + JSON.stringify(operation));
      return operation;
    }
    await pause(1000);
  }
  throw new Error('Canonical ' + action + ' timed out; command was not replayed');
}

module.exports = {request, expectRequest, lifecycle};
