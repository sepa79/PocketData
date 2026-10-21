const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {setTimeout: pause} = require('node:timers/promises');
const {deviceSignIn} = require('./support/device-signin.cjs');
const {verifyPlannerJournalAfterRestart} = require('./support/family-auth.cjs');

const hive = 'http://localhost:8089';
const artifacts = process.env.PD_FAMILY_AUTH_ARTIFACTS || '/tmp/pocketdata-family-auth';
const freshRequested = process.env.PD_FAMILY_AUTH_CREATE_SWARM === 'yes';
const swarmId = 'pd-family-journal-' + Date.now() + '-' + randomUUID().slice(0, 8);
let runId;

async function api(page, endpoint, method = 'GET', body) {
  return page.evaluate(async ({endpoint, method, body}) => {
    const response = await fetch('/orchestrator' + endpoint, {method, headers: {Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const text = await response.text();
    return {status: response.status, body: text ? JSON.parse(text) : null};
  }, {endpoint, method, body});
}

async function lifecycle(page, action) {
  const body = {idempotencyKey: randomUUID(), ...(action === 'create' ? {
    templateId: 'artemis-rest', autoPullImages: false, networkMode: 'DIRECT', sutId: 'wiremock-local', variablesProfileId: null, networkProfileId: null,
  } : {})};
  const accepted = await api(page, '/api/swarms/' + swarmId + '/' + action, 'POST', body);
  assert.equal(accepted.status, 202, `Owned QA ${action} admission returned HTTP ${accepted.status}`);
  assert.ok(accepted.body.correlationId && accepted.body.idempotencyKey);
  const deadline = Date.now() + Math.min((accepted.body.timeoutMs || 120000) + 10000, 150000);
  while (Date.now() < deadline) {
    const result = await api(page, '/api/swarms/' + swarmId + '/operations/' + accepted.body.correlationId);
    assert.equal(result.status, 200);
    assert.equal(result.body.swarmId, swarmId);
    assert.equal(result.body.correlationId, accepted.body.correlationId);
    if (!['ACCEPTED', 'DISPATCHED'].includes(result.body.state)) {
      assert.equal(result.body.state, 'SUCCEEDED', `${action} finished as ${result.body.state}; no retry`);
      return result.body;
    }
    await pause(500);
  }
  throw new Error(`Owned QA ${action} deadline expired; no command replay`);
}

async function freshJournal(context, phase) {
  const page = await context.newPage();
  const destination = hive + '/journal/swarms/' + swarmId + '?runId=' + encodeURIComponent(runId);
  const observed = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === hive && url.pathname === '/orchestrator/api/swarms/' + swarmId + '/journal/page' && url.searchParams.get('runId') === runId;
  }, {timeout: 45000});
  try {
    await page.goto(destination);
    const response = await observed;
    assert.equal(response.status(), 200, `Fresh exact journal ${phase} must return HTTP 200`);
    assert.equal(await page.locator('#username').count(), 0, 'Fresh journal must reuse central PH login');
    assert.ok(/^Bearer\s+\S+$/.test((await response.request().allHeaders()).authorization || ''), 'PH must obtain its own journal authorization');
    const data = await response.json();
    assert.ok(Array.isArray(data.items) && data.items.length > 0, 'Real journal must contain retained events');
    await page.waitForURL(destination);
    await page.screenshot({path: path.join(artifacts, 'fresh-journal-' + phase + '.png')});
    return {swarmId, runId, journalReadStatus: 200, eventCount: data.items.length, centralSessionReused: true};
  } finally { await page.close(); }
}

(async () => {
  assert.ok(path.isAbsolute(artifacts), 'PD_FAMILY_AUTH_ARTIFACTS must be absolute');
  await fs.mkdir(artifacts, {recursive: true});
  const {chromium} = require(process.env.PD_TEST_PLAYWRIGHT || 'playwright');
  const browser = await chromium.launch({headless: true, executablePath: process.env.PD_TEST_BROWSER, args: ['--no-sandbox']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, timezoneId: 'Europe/London'});
  context.setDefaultTimeout(25000);
  const summary = {freshSwarmRequested: freshRequested, privateDesktopForwardingVerified: false, primaryPlannerMutated: false, phConfigurationMutated: false};
  let ph;
  let createAttempted = false;
  let failure;
  try {
    const primary = await context.newPage();
    await primary.goto('http://localhost:8765/#/plan');
    await deviceSignIn(primary, context, false);
    summary.centralSignInVerified = true;
    if (freshRequested) {
      ph = await context.newPage();
      await ph.goto(hive + '/login');
      await ph.getByRole('button', {name: 'Sign in with PocketHive', exact: true}).click();
      await ph.waitForURL(hive + '/');
      assert.equal(await ph.locator('#username').count(), 0);
      const catalogue = await api(ph, '/api/planner/catalogue');
      assert.equal(catalogue.status, 200);
      assert.equal(catalogue.body.instanceId, 'pocketplanner-java-local');
      summary.phMasterInstance = catalogue.body.instanceId;
      const validation = await api(ph, '/api/planner/validate', 'POST', {instanceId: 'integration-qa', revision: 1, planId: 'contract-plan', streamId: 'stream-alpha', activityId: 'activity-alpha-minimal'});
      assert.equal(validation.status, 409, 'A foreign QA catalogue must not bypass the configured PH master');
      summary.freshPlannerLink = {status: 'gap', validationStatus: 409, reason: 'PH validates links only against primary PP; no catalogue rewrite, primary import or generic metadata bypass is permitted.'};
      createAttempted = true;
      const created = await lifecycle(ph, 'create');
      runId = created.runtime.runId;
      assert.ok(runId);
      await lifecycle(ph, 'start');
      await pause(1200);
      await lifecycle(ph, 'stop');
      summary.freshJournalBeforePlannerRestart = await freshJournal(context, 'before');
      console.log('PASS fresh local WireMock run, exact journal HTTP 200 and central PH login');
    }
    summary.plannerRestart = await verifyPlannerJournalAfterRestart(context);
    if (freshRequested) {
      summary.freshJournalAfterPlannerRestart = await freshJournal(context, 'after');
      console.log('PASS same fresh exact-run journal HTTP 200 after genuine PP restart');
    }
  } catch (error) {
    failure = error;
    summary.error = error.message;
  } finally {
    if (createAttempted && ph) {
      try {
        const current = await api(ph, '/api/swarms/' + swarmId);
        if (current.status !== 404) {
          assert.equal(current.status, 200);
          assert.equal(current.body.id, swarmId);
          assert.equal(current.body.templateId, 'artemis-rest');
          if (runId) assert.equal(current.body.runId, runId);
          await lifecycle(ph, 'remove');
        }
        summary.ownedFreshSwarmRemoved = true;
      } catch (error) { summary.cleanupError = error.message; failure = failure || error; }
    }
    await fs.writeFile(path.join(artifacts, 'summary.json'), JSON.stringify(summary, null, 2));
    await context.close();
    await browser.close();
  }
  console.log(JSON.stringify(summary, null, 2));
  if (failure) throw failure;
  if (summary.plannerRestart?.status !== 'passed') process.exitCode = 2;
})().catch(error => { console.error(error.message); if (error.errors) for (const cause of error.errors) console.error('Cause: ' + cause.message); process.exitCode = 1; });
