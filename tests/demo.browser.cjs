const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {setTimeout: pause} = require('node:timers/promises');
const {CirculationResources} = require('./support/ph-redis-resources.cjs');
const {expectRequest} = require('./support/ph-redis-api.cjs');
const {deviceSignIn} = require('./support/device-signin.cjs');
const {chromium} = require(process.env.POCKETDATA_TEST_PLAYWRIGHT);

const configuration = {redisContainer: 'pockethive-redis-1', redisNetwork: 'pockethive',
  phNetwork: 'pp-ph-integration', image: 'pocketdata-local:dev'};
const identity = 'pd-ph-qa-demo-' + Date.now() + '-' + randomUUID().slice(0, 8);
const resources = new CirculationResources(identity, configuration);
const artifacts = process.env.POCKETDATA_DEMO_TEST_ARTIFACTS;
assert.ok(artifacts && path.isAbsolute(artifacts));
fs.mkdirSync(artifacts, {recursive: true});
const evidence = {identity, passed: false, operationalMutations: false};
let browser;

(async () => {
  try {
    let {origin, imageId} = resources.start();
    evidence.imageId = imageId;
    execFileSync('docker', ['network', 'connect', 'pocketdata_demo', identity]);
    for (let attempt = 0; attempt < 90; attempt++) {
      try { if ((await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok) break; }
      catch (failure) { if (attempt === 89) throw failure; }
      await pause(500);
    }
    const login = await expectRequest('http://localhost:8089', null, 'POST', '/auth-service/api/auth/dev/login', 200, {username: 'local-admin'});
    const token = login.accessToken;
    const other = {id: 'other-synthetic', name: 'Do not replace this definition', description: 'Isolated preservation fixture', endpoints: {api: 'http://unused.invalid'}};
    assert.deepEqual(await expectRequest(origin, null, 'GET', '/api/catalog', 200), {revision: 0, suts: []});
    await expectRequest(origin, token, 'PUT', '/api/catalog', 200, {revision: 0, suts: [other]});
    const seed = () => execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/seed-demo.mjs'),
      '--origin', origin, '--auth-origin', 'http://localhost:8089', '--id', identity, '--confirm'], {encoding: 'utf8', timeout: 150000});
    console.log(seed().trim());
    const base = '/api/suts/' + identity + '/datasets';
    assert.deepEqual((await expectRequest(origin, null, 'GET', base, 200))[0].counts, {ready: 3, returned: 0});
    const catalog = await expectRequest(origin, null, 'GET', '/api/catalog', 200);
    assert.deepEqual(catalog.suts.find(item => item.id === other.id), other);
    const inventories = await expectRequest(origin, token, 'GET', base + '/cards/inventory', 200);
    assert.equal(inventories.length, 1);
    console.log(seed().trim());
    assert.deepEqual(await expectRequest(origin, null, 'GET', '/api/catalog', 200), catalog);
    assert.deepEqual(await expectRequest(origin, token, 'GET', base + '/cards/inventory', 200), inventories);
    assert.deepEqual((await expectRequest(origin, null, 'GET', base, 200))[0].counts, {ready: 3, returned: 0});
    console.log('PASS authenticated setup preserves other SUTs and does not repeat population');

    browser = await chromium.launch({executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox']});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/#/population');
    await deviceSignIn(page, context, false);
    await page.locator('#sut-select').selectOption(identity);
    await page.getByRole('combobox', {name: /^DataSet/}).selectOption('cards');
    const recipe = JSON.parse(await page.getByRole('textbox', {name: 'JSON script'}).inputValue());
    assert.deepEqual(recipe.steps.map(step => step.call.response.kind), ['JSON', 'SOAP11', 'SOAP12']);
    await page.getByRole('button', {name: 'Run script…', exact: true}).click();
    await page.getByRole('button', {name: 'Confirm Run', exact: true}).click();
    await page.getByRole('heading', {name: 'SUCCEEDED', exact: true}).waitFor({timeout: 30000});
    assert.deepEqual((await expectRequest(origin, null, 'GET', base, 200))[0].counts, {ready: 4, returned: 0});
    const rows = resources.redis('LRANGE', resources.keys[1], '0', '9').split('\n').map(value => JSON.parse(value));
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.customer, '000001');
      assert.match(row.accountNumber, /^000-demo-account-/);
      assert.match(row.cardNumber, /^000-demo-card11-/);
      assert.match(row.cardNumber12, /^000-demo-card12-/);
    }
    await page.screenshot({path: path.join(artifacts, 'demo-population.png'), fullPage: true});
    assert.deepEqual(errors, []);
    console.log('PASS default UI script executes JSON + SOAP11 + SOAP12 against persistent demo mock');
    execFileSync('docker', ['restart', '--time', '15', identity], {stdio: 'pipe'});
    const binding = resources.inspect(identity).NetworkSettings.Ports['8785/tcp'][0];
    origin = 'http://localhost:' + binding.HostPort;
    for (let attempt = 0; attempt < 90; attempt++) {
      try { if ((await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok) break; }
      catch (failure) { if (attempt === 89) throw failure; }
      await pause(500);
    }
    assert.deepEqual(await expectRequest(origin, null, 'GET', '/api/catalog', 200), catalog);
    assert.deepEqual((await expectRequest(origin, null, 'GET', base, 200))[0].counts, {ready: 4, returned: 0});
    assert.equal((await expectRequest(origin, token, 'GET', base + '/cards/inventory', 200)).length, 2);
    evidence.passed = true;
    console.log('PASS demo catalogue, CSV and Redis survive restart');
  } catch (failure) {
    evidence.failure = failure.stack;
    console.error(failure.stack);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    try { resources.cleanup(); evidence.cleanupVerified = true; }
    catch (failure) { evidence.cleanupError = failure.message; process.exitCode = 1; }
    fs.writeFileSync(path.join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
