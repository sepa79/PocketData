const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function portableBundle(directory, identity, endpoint, fixture, seed, params, fault) {
  const queueInput = {type: 'ARTEMIS', artemis: {consumerWindowBytes: 0}};
  const queueOutput = {type: 'ARTEMIS', artemis: {persistent: true}};
  const bee = (role, configuration, input, output) => ({
    role, image: role + ':latest', config: {enabled: false, historyPolicy: 'FULL', ...configuration},
    work: {...(input ? {in: {in: input}} : {}), ...(output ? {out: {out: output}} : {})},
    ports: [...(input ? [{id: 'in', direction: 'in'}] : []), ...(output ? [{id: 'out', direction: 'out'}] : [])]
  });
  const call = JSON.parse(fixture.toString('utf8'));
  const step = {callId: call.request.callId, retry: {maxAttempts: 1}, continueOnNon2xx: false};
  const description = 'Owned synthetic PH portable SOAP acceptance: ' + identity;
  const scenario = {
    protocolVersion: '2.0.0', id: identity, name: identity, description,
    template: {image: 'swarm-controller:latest', bees: [
      bee('generator', {
        inputs: {type: 'SCHEDULER', scheduler: {ratePerSec: 1, maxMessages: 1}},
        outputs: queueOutput,
        message: {bodyType: 'SIMPLE', body: JSON.stringify(seed), headers: {'x-ph-call-id': call.request.callId}}
      }, null, 'seed'),
      bee('http-sequence', {
        inputs: queueInput, outputs: queueOutput,
        baseUrl: "{{ sut.endpoints['cards'].baseUrl }}", templateRoot: '/app/scenario/templates/http',
        serviceId: call.request.serviceId, threadCount: 1, vars: params,
        steps: fault ? [{id: 'fault', ...step}, {id: 'must-not-run', ...step}] : [{id: 'create', ...step}],
        debugCapture: {mode: 'NONE', bodyPreviewBytes: 0}
      }, 'seed', 'result'),
      bee('postprocessor', {
        inputs: queueInput, outputs: {type: 'NONE'}, forwardToOutput: false,
        txOutcomeSinkMode: 'NONE', dropTxOutcomeWithoutCallId: true
      }, 'result', null)
    ]},
    topology: {version: 1, edges: [
      {id: 'seed', from: {role: 'generator', port: 'out'}, to: {role: 'http-sequence', port: 'in'}},
      {id: 'result', from: {role: 'http-sequence', port: 'out'}, to: {role: 'postprocessor', port: 'in'}}
    ]}
  };
  const files = {
    'scenario.yaml': JSON.stringify(scenario, null, 2),
    'sut/portable-local/sut.yaml': JSON.stringify({
      id: 'portable-local', name: identity, type: 'http', endpoints: {cards: {kind: 'http', baseUrl: endpoint}}
    }, null, 2),
    'templates/http/create.json': fixture
  };
  fs.mkdirSync(directory, {recursive: true});
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(directory, name);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, content);
  }
  const archive = path.join(directory, 'bundle.zip');
  execFileSync('zip', ['-q', archive, ...Object.keys(files)], {cwd: directory, timeout: 15000});
  return {archive: fs.readFileSync(archive), description};
}

module.exports = {portableBundle};
