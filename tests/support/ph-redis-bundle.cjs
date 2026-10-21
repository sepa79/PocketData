const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function redisBundle(directory, identity, redisHost, readyKey, returnedKey) {
  const queueInput = {type: 'ARTEMIS', artemis: {consumerWindowBytes: 0}};
  const queueOutput = {type: 'ARTEMIS', artemis: {persistent: true}};
  const ports = (input, output) => [
    ...(input ? [{id: 'in', direction: 'in'}] : []),
    ...(output ? [{id: 'out', direction: 'out'}] : [])
  ];
  const bee = (role, config, input, output) => ({
    role, image: role + ':latest',
    config: {enabled: false, historyPolicy: 'FULL', ...config},
    work: {...(input ? {in: {in: input}} : {}), ...(output ? {out: {out: output}} : {})},
    ports: ports(input, output)
  });
  const descriptor = {
    protocolVersion: '2.0.0', id: identity, name: identity,
    description: 'Owned synthetic PocketData Redis circulation acceptance; local WireMock only.',
    template: {image: 'swarm-controller:latest', bees: [
      bee('generator', {
        inputs: {type: 'REDIS_DATASET', redis: {
          host: redisHost, port: 6379, ssl: false, listName: readyKey, sources: [],
          pickStrategy: 'ROUND_ROBIN', ratePerSec: 0.5, initialDelayMs: 0, tickIntervalMs: 100
        }},
        outputs: queueOutput,
        message: {bodyType: 'SIMPLE', body: '{{ payload }}', headers: {'x-ph-call-id': 'pd-circulation'}}
      }, null, 'seeds'),
      bee('request-builder', {
        inputs: queueInput, outputs: queueOutput, templateRoot: '/app/scenario/templates/http',
        serviceId: 'default', passThroughOnMissingTemplate: false
      }, 'seeds', 'requests'),
      bee('processor', {
        inputs: queueInput, outputs: queueOutput, baseUrl: "{{ sut.endpoints['default'].baseUrl }}",
        mode: 'THREAD_COUNT', threadCount: 1
      }, 'requests', 'responses'),
      bee('postprocessor', {
        inputs: queueInput, forwardToOutput: true, txOutcomeSinkMode: 'NONE', dropTxOutcomeWithoutCallId: true,
        outputs: {type: 'REDIS', redis: {
          host: redisHost, port: 6379, ssl: false, sourceStep: 'FIRST', pushDirection: 'RPUSH',
          routes: [], defaultList: returnedKey, maxLen: -1
        }}
      }, 'responses', null)
    ]},
    topology: {version: 1, edges: [
      ['generator', 'request-builder'], ['request-builder', 'processor'], ['processor', 'postprocessor']
    ].map(([source, target], index) => ({
      id: 'circulation-' + index, from: {role: source, port: 'out'}, to: {role: target, port: 'in'}
    }))}
  };
  const files = {
    'scenario.yaml': JSON.stringify(descriptor, null, 2),
    'sut/wiremock-local/sut.yaml': JSON.stringify({
      id: 'wiremock-local', name: 'Owned local mock only', type: 'http',
      endpoints: {default: {kind: 'http', baseUrl: 'http://wiremock:8080'}}
    }, null, 2),
    'templates/http/pd-circulation.yaml': JSON.stringify({
      serviceId: 'default', callId: 'pd-circulation', protocol: 'HTTP', method: 'POST',
      pathTemplate: '/api/test', bodyTemplate: '{{ payload }}',
      headersTemplate: {'Content-Type': 'application/json', 'X-Acceptance-Template': 'pd-circulation'}
    }, null, 2)
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), {recursive: true});
    fs.writeFileSync(path.join(directory, name), content);
  }
  const archive = path.join(directory, 'bundle.zip');
  execFileSync('zip', ['-q', archive, ...Object.keys(files)], {cwd: directory});
  return fs.readFileSync(archive);
}

module.exports = {redisBundle};
