const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');

const label = 'io.pockethive.pocketdata.acceptance';
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8', timeout: 45000}).trim();

class CirculationResources {
  constructor(identity, configuration) {
    assert.match(identity, /^pd-ph-qa-[a-z0-9-]+$/);
    this.identity = identity;
    this.config = configuration;
    this.keys = ['meta:format', 'data:ready', 'data:returned'].map(suffix => identity + ':cards:' + suffix);
    this.containerOwned = false;
    this.volumeOwned = false;
    this.namespaceOwned = false;
  }

  inspect(name) { return JSON.parse(docker('inspect', name))[0]; }

  redis(command, ...args) {
    assert.ok(['PING', 'EXISTS', 'GET', 'LLEN', 'LRANGE', 'DEL'].includes(command));
    if (command === 'DEL' || command === 'EXISTS') assert.deepEqual(args, this.keys);
    if (['GET', 'LLEN', 'LRANGE'].includes(command)) assert.ok(this.keys.includes(args[0]));
    if (command === 'LRANGE') assert.deepEqual(args.slice(1), ['0', '9']);
    return docker('exec', this.config.redisContainer, 'redis-cli', '-n', '0', '--raw', command, ...args);
  }

  start() {
    const redis = this.inspect(this.config.redisContainer);
    assert.equal(redis.Config.Labels['com.docker.compose.project'], 'pockethive');
    assert.equal(redis.Config.Labels['com.docker.compose.service'], 'redis');
    assert.equal(redis.State.Running, true);
    assert.ok(redis.NetworkSettings.Networks[this.config.redisNetwork]);
    assert.equal(this.redis('PING'), 'PONG');
    assert.equal(this.redis('EXISTS', ...this.keys), '0', 'Synthetic namespace must not pre-exist');
    this.namespaceOwned = true;
    const imageId = docker('image', 'inspect', this.config.image, '--format', '{{.Id}}');
    docker('volume', 'create', '--label', label + '=' + this.identity, this.identity);
    this.volumeOwned = true;
    docker('run', '-d', '--name', this.identity, '--label', label + '=' + this.identity,
      '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--network', this.config.redisNetwork, '--network', this.config.phNetwork,
      '-p', '127.0.0.1::8785', '-v', this.identity + ':/data',
      '-e', 'POCKETDATA_REDIS_URL=redis://' + this.config.redisContainer + ':6379/0',
      '-e', 'POCKETHIVE_AUTH_BASE_URL=http://ui:8088/auth-service', imageId);
    this.containerOwned = true;
    const container = this.inspect(this.identity);
    const binding = container.NetworkSettings.Ports['8785/tcp'];
    assert.equal(binding.length, 1);
    assert.equal(binding[0].HostIp, '127.0.0.1');
    this.origin = 'http://localhost:' + binding[0].HostPort;
    return {origin: this.origin, imageId};
  }

  attachOwnedWorkers(runId) {
    const ids = docker('ps', '-q', '--filter', 'label=pockethive.swarmId=' + this.identity,
      '--filter', 'label=pockethive.runId=' + runId).split('\n').filter(Boolean);
    let attached = 0;
    for (const id of ids) {
      const container = this.inspect(id);
      const labels = container.Config.Labels;
      assert.equal(labels['pockethive.swarmId'], this.identity);
      assert.equal(labels['pockethive.runId'], runId);
      if (!['generator', 'postprocessor'].includes(labels['pockethive.role'])) continue;
      assert.ok(container.NetworkSettings.Networks[this.config.phNetwork]);
      assert.ok(!container.NetworkSettings.Networks[this.config.redisNetwork], 'Do not silently alter existing attachment');
      docker('network', 'connect', this.config.redisNetwork, id);
      attached++;
    }
    assert.equal(attached, 2, 'Only the two owned Redis workers join the existing Redis network');
  }

  ownedWorkerCount() {
    return docker('ps', '-aq', '--filter', 'label=pockethive.swarmId=' + this.identity).split('\n').filter(Boolean).length;
  }

  cleanup() {
    if (this.namespaceOwned) {
      assert.equal(this.ownedWorkerCount(), 0, 'Leave namespace intact if owned workers remain');
    }
    if (this.containerOwned) {
      assert.equal(this.inspect(this.identity).Config.Labels[label], this.identity);
      docker('stop', '--time', '15', this.identity);
      docker('rm', this.identity);
      this.containerOwned = false;
    }
    if (this.namespaceOwned) {
      this.redis('DEL', ...this.keys);
      assert.equal(this.redis('EXISTS', ...this.keys), '0');
      this.namespaceOwned = false;
    }
    if (this.volumeOwned) {
      const volume = JSON.parse(docker('volume', 'inspect', this.identity))[0];
      assert.equal(volume.Labels[label], this.identity);
      docker('volume', 'rm', this.identity);
      this.volumeOwned = false;
    }
  }
}

module.exports = {CirculationResources};
