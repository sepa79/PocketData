const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { verifyPopulationPacing } = require('./support/population-pacing.cjs');

async function requireFreePort(port) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  } finally {
    if (probe.listening) await new Promise(resolve => probe.close(resolve));
  }
}

async function main() {
  assert.equal(process.env.POCKETDATA_TEST_REDIS_URL, 'redis://127.0.0.1:16385/0', 'Use the explicitly isolated test Redis.');
  const root = path.resolve(__dirname, '..');
  const artifacts = await fs.mkdtemp('/tmp/pd-workspace-ui-');
  const data = path.join(artifacts, 'data');
  const processes = [];
  let browser;
  function start(command, args, extra) {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => output.push(chunk));
    processes.push({ child, output, command });
    return child;
  }
  try {
    await requireFreePort(8786);
    await requireFreePort(18786);
    const auth = start('python3', ['tests/auth-fixture.py'], { POCKETDATA_QA_AUTH_FIXTURE: '1' });
    const app = start('java', ['-jar', 'target/pocketdata.jar'], {
      PORT: '8786', POCKETDATA_DATA_DIR: data, POCKETDATA_REDIS_URL: process.env.POCKETDATA_TEST_REDIS_URL,
      POCKETHIVE_AUTH_BASE_URL: 'http://127.0.0.1:18786', POCKETHIVE_ALLOW_REMOTE_HTTP: 'false',
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(app.exitCode, null, 'Isolated app exited before readiness.');
      assert.equal(auth.exitCode, null, 'Isolated identity fixture exited.');
      const ownStartup = Buffer.concat(processes.find(entry => entry.child === app).output).toString().includes('Tomcat started on port 8786');
      try { ready = ownStartup && (await fetch('http://localhost:8786/health')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(ready, 'App did not become ready.');
    const { chromium } = require(process.env.PD_TEST_PLAYWRIGHT || 'playwright');
    browser = await chromium.launch({ executablePath: process.env.PD_TEST_BROWSER, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const smoke = new Function(`return (${await fs.readFile(path.join(root, 'tests/browser-smoke.js'), 'utf8')})`)();
    const smokeResult = await smoke(page);
    await page.close();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addInitScript(() => sessionStorage.setItem('POCKETDATA_AUTH_SESSION', JSON.stringify({ accessToken: 'phweb_pocketdata_browser_fixture', expiresAt: Date.now() + 3600000 })));
    const editor = await context.newPage();
    const errors = [];
    editor.on('pageerror', error => errors.push(error.message));
    const origin = 'http://localhost:8786';
    const details = `${origin}/#/datasets/details?sut=qa-ui&dataset=qa-cards`;
    await editor.goto(details);
    await editor.getByRole('heading', { name: 'qa-cards', exact: true }).waitFor();
    assert.equal(await editor.locator('header #sut-select').count(), 0);
    assert.equal(await editor.getByRole('combobox', { name: 'Selected SUT', exact: true }).inputValue(), 'qa-ui');
    await editor.screenshot({ path: path.join(artifacts, 'details-desktop.png') });
    await editor.getByRole('button', { name: 'Edit DataSet', exact: true }).click();
    await editor.getByRole('dialog', { name: 'Edit DataSet' }).waitFor();
    await editor.getByLabel('Description', { exact: true }).fill('Shared synthetic accounts for JSON and SOAP');
    await editor.getByRole('button', { name: 'Add list', exact: true }).click();
    await editor.getByLabel('List name 2', { exact: true }).fill('returned');
    await editor.getByRole('button', { name: 'Add field', exact: true }).click();
    await editor.getByLabel('Field name 2', { exact: true }).fill('customerId');
    assert.equal(await editor.getByLabel('Required 2', { exact: true }).isChecked(), false);
    assert.equal(await editor.getByLabel('Required 2', { exact: true }).isDisabled(), true);
    await editor.getByRole('button', { name: 'Help: Name / Redis namespace', exact: true }).focus();
    await editor.getByRole('tooltip').filter({ hasText: 'cannot change after creation' }).waitFor();
    await editor.screenshot({ path: path.join(artifacts, 'edit-desktop.png') });
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await editor.getByRole('dialog').waitFor({ state: 'hidden' });
    await editor.getByRole('cell', { name: 'customerId', exact: true }).or(editor.getByRole('rowheader', { name: 'customerId', exact: true })).waitFor();
    assert.equal(await editor.getByLabel('Full Redis key: qa-ui:qa-cards:data:returned', { exact: true }).count(), 1);
    await editor.reload();
    await editor.getByRole('heading', { name: 'qa-cards', exact: true }).waitFor();
    await editor.getByRole('button', { name: 'Edit DataSet', exact: true }).click();
    const base = '/api/suts/qa-ui/datasets/qa-cards';
    const current = (await (await editor.request.get(origin + '/api/suts/qa-ui/datasets')).json())[0].format;
    const response = await editor.request.put(origin + base, { headers: { Authorization: 'Bearer phweb_pocketdata_browser_fixture' }, data: { expected: current, definition: { ...current, description: 'Concurrent edit' } } });
    assert.equal(response.status(), 200);
    await editor.getByLabel('Description', { exact: true }).fill('Stale draft');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await editor.getByRole('alert').filter({ hasText: 'Reload before editing' }).waitFor();
    assert.equal(await editor.getByLabel('Description', { exact: true }).inputValue(), 'Stale draft');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await editor.getByRole('button', { name: '← DataSets', exact: true }).click();
    await editor.getByRole('table', { name: 'DataSets in selected SUT' }).waitFor();
    await editor.screenshot({ path: path.join(artifacts, 'table-desktop.png') });
    await editor.getByRole('button', { name: 'qa-cards', exact: true }).click();
    await editor.getByRole('button', { name: 'Populate with a script', exact: true }).click();
    await editor.getByRole('combobox', { name: 'Target list', exact: true }).selectOption('returned');
    assert.equal(await editor.getByLabel('Full Redis key: qa-ui:qa-cards:data:returned', { exact: true }).count(), 1);
    await editor.getByRole('link', { name: 'View DataSet format and lists →', exact: true }).click();
    await editor.getByRole('heading', { name: 'qa-cards', exact: true }).waitFor();
    await editor.setViewportSize({ width: 390, height: 844 });
    await editor.screenshot({ path: path.join(artifacts, 'details-mobile.png') });
    await editor.getByRole('button', { name: 'Edit DataSet', exact: true }).click();
    await editor.screenshot({ path: path.join(artifacts, 'edit-mobile.png') });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const dialog = await editor.getByRole('dialog').boundingBox();
    assert(dialog.x >= 0 && dialog.x + dialog.width <= 390, 'Editor exceeds viewport.');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await editor.getByRole('button', { name: '← DataSets', exact: true }).click();
    await editor.getByRole('table', { name: 'DataSets in selected SUT', exact: true }).waitFor();
    await editor.screenshot({ path: path.join(artifacts, 'table-mobile.png') });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const viewer = await browser.newPage();
    await viewer.goto(details);
    await viewer.getByRole('heading', { name: 'qa-cards', exact: true }).waitFor();
    assert.equal(await viewer.getByRole('button', { name: 'Edit DataSet', exact: true }).count(), 0);
    assert.equal((await viewer.request.put(origin + base, { data: { expected: current, definition: current } })).status(), 401);
    const pacing = await verifyPopulationPacing(editor, origin, artifacts);
    assert.deepEqual(errors, []);
    const evidence = { passed: true, smokeResult, pacing, datasetEdit: true, staleConflict: true, reloadContext: true, readonly: true, desktopMobile: true, browserErrors: errors, auth: 'synthetic identity fixture, not PH SSO', artifacts };
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    if (browser) await browser.close();
    for (const { child, output, command } of processes.reverse()) {
      if (child.exitCode === null) {
        const ended = once(child, 'exit');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
        await ended;
        clearTimeout(timer);
      }
      await fs.writeFile(path.join(artifacts, `${command}.log`), Buffer.concat(output));
    }
    console.log(`Artifacts: ${artifacts}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
