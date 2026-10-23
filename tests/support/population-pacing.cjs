const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const path = require('node:path');
const {setTimeout: pause} = require('node:timers/promises');

async function verifyPopulationPacing(page, origin, artifacts) {
  assert.equal(origin, 'http://localhost:8786');
  assert.equal(process.env.POCKETDATA_TEST_REDIS_URL, 'redis://127.0.0.1:16385/0');
  const sut = 'qa-pacing-' + Date.now();
  const headers = {Authorization: 'Bearer phweb_pocketdata_browser_fixture'};
  const calls = [];
  let responseDelay = 0;
  let active = 0;
  let maximumActive = 0;
  let jobId;
  const mock = createServer(async (request, response) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    const call = {started: performance.now(), ended: 0, body: ''};
    calls.push(call);
    for await (const chunk of request) call.body += chunk;
    await pause(responseDelay);
    response.writeHead(201, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({accountNumber: '000qa-' + calls.length}));
    call.ended = performance.now();
    active--;
  });
  const base = `${origin}/api/suts/${sut}/datasets/cards/population`;
  async function mcp(method, params) {
    const response = await page.request.post(origin + '/mcp', {headers:{...headers,Accept:'application/json, text/event-stream'}, data:{jsonrpc:'2.0',id:1,method,params}});
    assert.equal(response.status(), 200);
    const text = await response.text();
    const envelope = JSON.parse(text.startsWith('{') ? text : text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'));
    assert.equal(envelope.error, undefined, JSON.stringify(envelope));
    return envelope.result;
  }
  async function tool(name, args) {
    const result = await mcp('tools/call', {name,arguments:args});
    assert.equal(result.isError, false, JSON.stringify(result));
    return result.structuredContent;
  }
  async function status() {
    const response = await page.request.get(base + '/' + jobId, {headers});
    assert.equal(response.status(), 200);
    return response.json();
  }
  async function until(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const job = await status();
      if (predicate(job)) return job;
      assert.notEqual(job.status, 'FAILED', job.error);
      await pause(100);
    }
    throw new Error('Owned pacing job did not reach expected state');
  }
  async function run() {
    await page.getByRole('button', {name:'Run script…', exact:true}).click();
    const accepted = page.waitForResponse(response => response.url() === base + '?list=ready' && response.request().method() === 'POST');
    await page.getByRole('button', {name:'Confirm Run', exact:true}).click();
    const response = await accepted;
    assert.equal(response.status(), 202);
    const snapshot = await response.json();
    jobId = snapshot.id;
    return snapshot;
  }
  async function editable() {
    await page.getByRole('button', {name:'Stop', exact:true}).waitFor({state:'hidden'});
    await page.getByLabel('Pacing value', {exact:true}).waitFor();
    for (let attempt = 0; attempt < 50 && await page.getByLabel('Pacing value', {exact:true}).isDisabled(); attempt++) await pause(100);
    assert.equal(await page.getByLabel('Pacing value', {exact:true}).isDisabled(), false);
  }
  try {
    await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
    const catalog = await (await page.request.get(origin + '/api/catalog')).json();
    const saved = await page.request.put(origin + '/api/catalog', {headers, data:{revision:catalog.revision, suts:[...catalog.suts,
      {id:sut,name:'Pacing test only',description:'Isolated pacing fixture',endpoints:{api:`http://127.0.0.1:${mock.address().port}`}}]}});
    assert.equal(saved.status(), 200);
    assert.equal((await page.request.post(`${origin}/api/suts/${sut}/datasets`, {headers, data:{sutId:sut,name:'cards',description:'Synthetic',fields:[{name:'accountNumber',type:'string',required:true}],lists:['ready']}})).status(), 200);
    const recipe = {name:'Create a synthetic record',count:3,pacing:{mode:'DELAY',value:200,unit:'MILLISECONDS'},values:{},params:{},steps:[{
      name:'Create',endpoint:'api',call:{profile:'portable-v1',requires:['json_path'],
        request:{serviceId:'qa',callId:'create',protocol:'HTTP',method:'POST',pathTemplate:'/create',headersTemplate:{'Content-Type':'application/json'},bodyTemplate:'{"iteration":{{ params.iteration }}}'},
        response:{kind:'JSON',soapAction:'',expectedStatus:201,extract:{accountNumber:'/accountNumber'},namespaces:{}}}}]};
    await page.setViewportSize({width:1366,height:900});
    await page.goto(`${origin}/#/population?sut=${sut}&dataset=cards`);
    await page.reload();
    await page.getByLabel('Iterations', {exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox', {name:'JSON script',exact:true}).isVisible(), false);
    const initialized = await mcp('initialize', {protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'PocketData browser QA',version:'1'}});
    assert.equal(initialized.serverInfo.name, 'PocketData');
    assert.equal((await mcp('tools/list', {})).tools.length, 11);
    assert.equal((await tool('get_access', {})).canEdit, true);
    assert.equal((await tool('validate_population', {sut,dataset:'cards',list:'ready',recipe})).executed, false);
    const draft = await tool('get_population_draft', {sut,dataset:'cards'});
    const savedDraft = await tool('save_population_draft', {sut,dataset:'cards',list:'ready',recipe,expected_revision:draft.revision});
    assert.equal(savedDraft.revision, 1);
    assert.equal(calls.length, 0);
    await page.getByRole('button', {name:'Load saved script',exact:true}).click();
    await page.getByRole('heading', {name:recipe.name,exact:true}).waitFor();
    assert.equal(await page.getByLabel('Iterations',{exact:true}).inputValue(), '3');
    assert.equal(await page.getByLabel('Pacing value',{exact:true}).inputValue(), '200');
    assert.equal(calls.length, 0, 'Loading the MCP draft must not execute SUT requests');
    await page.screenshot({path:path.join(artifacts,'pacing-desktop.png')});
    await run();
    let done = await until(job => job.status === 'SUCCEEDED');
    assert.equal(done.published, 3); assert.equal(done.waiting, false);
    assert(done.achievedPerSecond > 0);
    assert.equal(calls.length, 3);
    assert(calls[1].started - calls[0].ended >= 195);
    assert(calls[2].started - calls[1].ended >= 195);
    assert.deepEqual(calls.map(call=>JSON.parse(call.body).iteration),[1,2,3]);
    await editable();
    await page.getByLabel('Pacing mode',{exact:true}).selectOption('RATE');
    await page.getByLabel('Pacing unit',{exact:true}).selectOption('SECONDS');
    await page.getByLabel('Pacing value',{exact:true}).fill('20');
    responseDelay = 350;
    const beforeSlow = calls.length;
    const rate = await run();
    assert.deepEqual(rate.pacing,{mode:'RATE',value:20,unit:'SECONDS'});
    done = await until(job=>job.status === 'SUCCEEDED');
    assert.equal(done.published,3);
    assert(done.achievedPerSecond > 0 && done.achievedPerSecond < 3);
    assert.equal(calls.length - beforeSlow,3);
    assert.equal(maximumActive,1);
    const frozenRate = done.achievedPerSecond;
    await pause(100);
    assert.equal((await status()).achievedPerSecond,frozenRate);
    await editable();
    responseDelay = 0;
    await page.getByLabel('Pacing mode',{exact:true}).selectOption('DELAY');
    await page.getByLabel('Pacing unit',{exact:true}).selectOption('DAYS');
    await page.getByLabel('Pacing value',{exact:true}).fill('2');
    const beforeWait = calls.length;
    await run();
    const waiting = await until(job=>job.waiting);
    assert(waiting.waitRemainingMs > 86_400_000);
    assert.equal(waiting.published,1);
    assert.equal(await page.getByLabel('Pacing value',{exact:true}).isDisabled(), true);
    await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
    await pause(1100);
    await page.getByRole('region',{name:'Population job',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'pacing-wait.png')});
    const stoppedAt = performance.now();
    await page.getByRole('button',{name:'Stop',exact:true}).click();
    done = await until(job=>job.status === 'STOPPED');
    assert(performance.now() - stoppedAt < 3000);
    assert.equal(calls.length-beforeWait,1);
    assert.equal(done.waitRemainingMs,0);
    await editable();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(artifacts,'pacing-mobile.png')});
    await page.getByRole('group',{name:'Iterations and pacing',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'pacing-controls-mobile.png')});
    return {mcpDiscovery:true,mcpDraftWithoutExecution:true,loadedSavedDraft:true,delayAfterIteration:true,attemptedRateWithSlowServer:true,singleExecutor:true,daysWaitStopped:true,achievedRateFrozen:true,advancedCollapsed:true,desktopMobile:true,requests:calls.length};
  } finally {
    try {
      if (jobId) {
        const current = await status();
        if (['RUNNING','STOPPING'].includes(current.status)) await page.request.post(base + '/' + jobId + '/stop',{headers});
      }
    } finally {
      mock.closeAllConnections();
      await new Promise(resolve=>mock.close(resolve));
    }
  }
}

module.exports = {verifyPopulationPacing};
