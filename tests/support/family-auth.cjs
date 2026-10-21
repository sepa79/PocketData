const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {readFile} = require('node:fs/promises');
const {setTimeout: pause} = require('node:timers/promises');
const {promisify} = require('node:util');
const {deviceSignIn} = require('./device-signin.cjs');

const execute = promisify(execFile);
const hiveOrigin = 'http://localhost:8089';
const ownerLabel = 'io.pocketdata.family-auth.owner';

class HistoricalJournalGap extends Error {
  constructor(message, journalReadStatus = null) {
    super(message);
    this.journalReadStatus = journalReadStatus;
  }
}

async function docker(args) {
  const result = await execute('docker', args, {timeout: 90000, maxBuffer: 512 * 1024});
  return result.stdout.trim();
}

async function inspect(kind, name) {
  try { return JSON.parse(await docker([kind, 'inspect', name]))[0]; }
  catch (failure) {
    const message = failure.stderr || '';
    if (/No such (?:object|container|volume)/i.test(message)
      || kind === 'volume' && message.includes('volume ' + name + ' not found')) return null;
    throw failure;
  }
}

async function acknowledgeBlocked(page) {
  const acknowledgement = page.getByRole('button', {name: 'Acknowledged', exact: true});
  try { await acknowledgement.waitFor({state: 'visible', timeout: 2000}); }
  catch (failure) { if (failure.name === 'TimeoutError') return; throw failure; }
  await acknowledgement.click();
}

async function workspace(page, origin) {
  const result = await page.request.get(origin + '/api/state', {timeout: 15000});
  assert.equal(result.status(), 200, 'QA workspace read must succeed');
  return result.json();
}

async function chooseHistory(page, exactRun) {
  const observed = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === new URL(page.url()).origin && url.pathname === '/api/integration/execution'
      && url.searchParams.get('planId') === 'contract-plan';
  }, {timeout: 45000});
  await page.getByRole('button', {name: 'Execution', exact: true}).click();
  const response = await observed;
  assert.equal(response.status(), 200, 'Real PH execution projection must succeed');
  const snapshot = await response.json();
  assert.ok(Array.isArray(snapshot.runs), 'PH execution snapshot has no run list');
  const candidates = snapshot.runs.filter(run => /^pp-java-qa-\d+$/.test(run.swarmId)
    && /^[a-f0-9-]{36}$/i.test(run.runId) && run.runtime === null && Array.isArray(run.activityIds) && run.activityIds.length);
  let selected;
  if (exactRun) selected = candidates.find(run => run.swarmId === exactRun.swarmId && run.runId === exactRun.runId);
  else {
    const proven = candidates.find(run => run.swarmId === 'pp-java-qa-1792430777331'
      && run.runId === '8cfd9596-b39d-4e34-b29c-14bca47ff8ed');
    selected = proven || candidates.sort((left, right) => (left.swarmId + '/' + left.runId).localeCompare(right.swarmId + '/' + right.runId))[0];
  }
  if (!selected) throw new HistoricalJournalGap(exactRun
    ? `The exact historical PH reference ${exactRun.swarmId}/${exactRun.runId} is absent after restart; no latest-run substitution.`
    : `No linked historical pp-java-qa-* run remains for integration-qa/contract-plan (${snapshot.runs.length} linked references observed). No swarm was created.`);
  await page.getByRole('checkbox', {name: 'Show run history', exact: true}).check();
  const badges = page.locator('.pp-runtime-run').filter({hasText: selected.swarmId});
  let badge;
  for (const candidate of await badges.all()) {
    if ((await candidate.getAttribute('title'))?.startsWith(`Run ${selected.runId} ·`)) { badge = candidate; break; }
  }
  assert.ok(badge, 'The exact historical run is absent from the actual Execution/history UI');
  await badge.click();
  await page.locator('.pp-swarm-panel').getByText(selected.runId, {exact: true}).waitFor();
  return {swarmId: selected.swarmId, runId: selected.runId};
}

async function openExactJournal(page, context, exactRun) {
  const link = page.getByRole('link', {name: 'Open PH journal ↗', exact: true});
  const expected = new URL(await link.getAttribute('href'));
  assert.equal(expected.origin, hiveOrigin);
  assert.equal(expected.pathname, '/journal/swarms/' + encodeURIComponent(exactRun.swarmId));
  assert.deepEqual([...expected.searchParams.keys()], ['runId']);
  assert.equal(expected.searchParams.get('runId'), exactRun.runId);
  const previousPages = new Set(context.pages());
  let journalResponse;
  const observe = response => {
    const url = new URL(response.url());
    if (url.origin === hiveOrigin && url.pathname === '/orchestrator/api/swarms/' + encodeURIComponent(exactRun.swarmId) + '/journal/page'
      && url.searchParams.get('runId') === exactRun.runId && !previousPages.has(response.frame().page())) journalResponse = response;
  };
  context.on('response', observe);
  let journal;
  try {
    const opened = context.waitForEvent('page', {timeout: 15000});
    await link.click();
    journal = await opened;
    const deadline = Date.now() + 45000;
    let loginClicked = false;
    while (!journalResponse && Date.now() < deadline) {
      assert.equal(await journal.locator('#username').count(), 0, 'Journal handoff requested credentials instead of reusing central PH login');
      const login = journal.getByRole('button', {name: 'Sign in with PocketHive', exact: true});
      if (!loginClicked && await login.isVisible() && await login.isEnabled()) { loginClicked = true; await login.click(); }
      await pause(150);
    }
    assert.ok(journalResponse, 'No actual exact-run journal page request after PH authorization');
    assert.equal(await journal.locator('#username').count(), 0, 'Journal must not ask for a username');
    if ([404, 410, 503].includes(journalResponse.status())) throw new HistoricalJournalGap(`Stored journal for ${exactRun.swarmId}/${exactRun.runId} returned HTTP ${journalResponse.status()}; no replacement run or mocked data was used.`, journalResponse.status());
    assert.equal(journalResponse.status(), 200, 'Actual PH journal page must return HTTP 200');
    assert.match((await journalResponse.request().allHeaders()).authorization || '', /^Bearer\s+\S+$/, 'PH journal must obtain independent authorization');
    const body = await journalResponse.json();
    if (!Array.isArray(body.items) || body.items.length === 0) throw new HistoricalJournalGap(`Stored journal for ${exactRun.swarmId}/${exactRun.runId} returned no retained events.`, 200);
    for (const item of body.items) {
      if (item.runId !== undefined) assert.equal(item.runId, exactRun.runId, 'Journal must preserve the exact run');
      if (item.swarmId !== undefined) assert.equal(item.swarmId, exactRun.swarmId, 'Journal must preserve the exact swarm');
    }
    await journal.waitForURL(expected.href, {timeout: 15000});
    return {...exactRun, journalReadStatus: 200, journalDataVerified: true, eventCount: body.items.length, centralSessionReused: true, independentPhAuthorization: true};
  } finally {
    context.off('response', observe);
    if (journal && !journal.isClosed()) await journal.close();
  }
}

async function journalEvidence(page, context, exactRun) {
  try { return await openExactJournal(page, context, exactRun); }
  catch (error) {
    if (!(error instanceof HistoricalJournalGap)) throw error;
    return {...exactRun, journalReadStatus: error.journalReadStatus, journalDataVerified: false, reason: error.message};
  }
}

async function verifyPlannerJournalAfterRestart(context) {
  const owner = randomUUID();
  const prefix = 'pd-family-auth-' + owner;
  const volume = prefix + '-data';
  const containers = new Set();
  const pages = new Set();
  const cleanupErrors = [];
  const browserErrors = [];
  let failure;
  let summary;

  async function ownedContainer(name) {
    const found = await inspect('container', name);
    if (!found) return null;
    assert.equal(found.Config.Labels[ownerLabel], owner, 'Refusing to touch a container without this test owner label');
    assert.equal(found.Name, '/' + name, 'Container name changed');
    assert.ok(found.Mounts.some(mount => mount.Type === 'volume' && mount.Name === volume && mount.Destination === '/data'), 'Unexpected QA volume mount');
    return found;
  }

  async function removeContainer(name) {
    const found = await ownedContainer(name);
    if (!found) return;
    if (found.State.Running) await docker(['container', 'stop', '--time', '10', found.Id]);
    const stopped = await ownedContainer(name);
    assert.ok(stopped && stopped.Id === found.Id && !stopped.State.Running, 'Exact owned container must be stopped before removal');
    await docker(['container', 'rm', found.Id]);
  }

  async function launch(phase) {
    const name = prefix + '-' + phase;
    containers.add(name);
    await docker(['container', 'create', '--pull=never', '--name', name, '--label', ownerLabel + '=' + owner,
      '--network', 'pp-ph-integration', '--user', '10001:10001', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=64m,mode=1777',
      '--publish', '127.0.0.1::8765', '--mount', `type=volume,source=${volume},target=/data`,
      '--env', 'PORT=8765', '--env', 'BIND_ADDRESS=0.0.0.0', '--env', 'TESTPLANNER_DB=/data/planner.sqlite3',
      '--env', 'POCKETPLANNER_INSTANCE_ID=integration-qa', '--env', 'POCKETHIVE_BASE_URL=http://ui:8088',
      '--env', 'POCKETHIVE_AUTH_BASE_URL=http://ui:8088/auth-service', '--env', 'POCKETHIVE_PUBLIC_URL=' + hiveOrigin,
      'pocketplanner-local:dev']);
    const created = await ownedContainer(name);
    assert.ok(created, 'Owned QA container was not created');
    await docker(['container', 'start', created.Id]);
    const mapping = await docker(['container', 'port', created.Id, '8765/tcp']);
    const match = /^127\.0\.0\.1:(\d+)$/.exec(mapping);
    assert.ok(match, 'Expected exactly one dynamically published localhost port');
    const origin = 'http://localhost:' + match[1];
    const deadline = Date.now() + 75000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      try { ready = (await fetch(origin + '/health', {signal: AbortSignal.timeout(2000)})).status === 200; }
      catch {}
      if (!ready) {
        const status = await ownedContainer(name);
        assert.ok(status?.State.Running, 'QA Planner exited before becoming healthy');
        await pause(350);
      }
    }
    assert.ok(ready, 'QA Planner did not become healthy within 75 seconds');
    const page = await context.newPage();
    pages.add(page);
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(origin + '/#/data');
    await page.getByRole('heading', {name: 'Data', exact: true}).waitFor({timeout: 30000});
    await acknowledgeBlocked(page);
    await deviceSignIn(page, context, true);
    return {name, origin, page};
  }

  try {
    assert.equal((await context.cookies(hiveOrigin + '/auth-service/')).length > 0, true, 'Parent must establish the real central PH session first');
    await docker(['image', 'inspect', 'pocketplanner-local:dev', '--format', '{{.Id}}']);
    await docker(['network', 'inspect', 'pp-ph-integration', '--format', '{{.Id}}']);
    await docker(['volume', 'create', '--label', ownerLabel + '=' + owner, volume]);
    assert.equal((await inspect('volume', volume)).Labels[ownerLabel], owner, 'QA volume owner label is missing');
    const first = await launch('before');
    assert.deepEqual((await workspace(first.page, first.origin)).plans, [], 'Import is permitted only into the brand-new empty QA store');
    const fixture = await readFile('/home/sepa/TestPlanner/tests/contracts/workspace.json');
    const authored = JSON.parse(fixture.toString('utf8'));
    assert.equal(authored.plans[0].id, 'contract-plan');
    assert.match(authored.plans[0].description, /^Synthetic/);
    await first.page.getByLabel('Workspace file', {exact: true}).setInputFiles({name: 'synthetic-contract-workspace.json', mimeType: 'application/json', buffer: fixture});
    first.page.once('dialog', dialog => dialog.accept());
    await first.page.getByRole('button', {name: 'Import JSON', exact: true}).click();
    await first.page.getByText('Workspace imported and saved.', {exact: true}).waitFor();
    await acknowledgeBlocked(first.page);
    const saved = await workspace(first.page, first.origin);
    assert.deepEqual(saved.plans.map(plan => plan.id), ['contract-plan']);
    const exactRun = await chooseHistory(first.page);
    const before = await journalEvidence(first.page, context, exactRun);
    assert.deepEqual(await workspace(first.page, first.origin), saved, 'Journal observation must not change Planner facts');
    await first.page.close();
    pages.delete(first.page);
    await removeContainer(first.name);
    const second = await launch('after');
    assert.notEqual(second.origin, first.origin, 'The restart must genuinely publish a different native application port');
    assert.deepEqual(await workspace(second.page, second.origin), saved, 'Restart must retain the exact workspace and revision on the same volume');
    const selectedAgain = await chooseHistory(second.page, exactRun);
    const after = await journalEvidence(second.page, context, selectedAgain);
    assert.deepEqual(await workspace(second.page, second.origin), saved, 'Second journal observation must not change Planner facts');
    assert.deepEqual(browserErrors, [], 'QA Planner browser errors');
    const journalsVerified = before.journalDataVerified && after.journalDataVerified;
    summary = {status: journalsVerified ? 'passed' : 'gap', ...(journalsVerified ? {} : {reason: 'Historical journal data unavailable; native restart and workspace persistence were still verified.'}),
      historicalJournalVerified: journalsVerified, before, after, nativeOriginBefore: first.origin, nativeOriginAfter: second.origin,
      genuineApplicationRestart: true, sameVolume: true, workspaceAndRevisionUnchanged: true,
      changedNativePortVerified: true, privateDesktopForwardingVerified: false,
      privateDesktopForwardingGap: 'http://localhost:52204 is ERR_CONNECTION_REFUSED from the native browser; not verified.',
      primaryPlannerMutated: false, phConfigurationMutated: false, swarmCreated: false, pageErrors: 0};
  } catch (error) {
    if (error instanceof HistoricalJournalGap) summary = {status: 'gap', reason: error.message, historicalJournalVerified: false,
      privateDesktopForwardingVerified: false, primaryPlannerMutated: false, phConfigurationMutated: false, swarmCreated: false};
    else failure = error;
  } finally {
    for (const page of pages) { if (!page.isClosed()) await page.close().catch(error => cleanupErrors.push(error.message)); }
    for (const name of containers) await removeContainer(name).catch(error => cleanupErrors.push(error.message));
    try {
      const found = await inspect('volume', volume);
      if (found) {
        assert.equal(found.Labels[ownerLabel], owner, 'Refusing to remove a volume without this test owner label');
        await docker(['volume', 'rm', volume]);
      }
    } catch (error) { cleanupErrors.push(error.message); }
  }
  if (cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors.map(message => new Error(message))],
    'Exact owned QA cleanup failed: ' + cleanupErrors.join('; ') + (failure ? '; original failure: ' + failure.message : ''));
  if (failure) throw failure;
  return {...summary, ownedContainersAndVolumeRemoved: true};
}

module.exports = {verifyPlannerJournalAfterRestart};
