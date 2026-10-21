const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const origin = process.env.PD_POPULATION_UI_ORIGIN
  assert(origin && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Set a local PD_POPULATION_UI_ORIGIN; API calls are intercepted with synthetic fixtures only.')
  const { chromium } = require(process.env.PD_TEST_PLAYWRIGHT || 'playwright')
  const artifacts = process.env.PD_TEST_ARTIFACTS || '/tmp/pocketdata-population-ui'
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.PD_TEST_BROWSER, headless: true, args: ['--no-sandbox'] })
  const recipe = {
    name: 'Synthetic SOAP browser recipe', count: 2, values: { customer: '001' }, params: { customer: '009', iteration: '999' },
    steps: [{ name: 'Create card', endpoint: 'cards', call: {
      profile: 'portable-v1', requires: ['xml_path', 'xml_text', 'xml_attr', 'soap11'],
      request: {
        serviceId: 'cards', callId: 'create', protocol: 'HTTP', method: 'POST', pathTemplate: '{{ endpoint.path }}',
        headersTemplate: {}, bodyTemplate: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:card="urn:synthetic:cards"><soap:Body><card:Create customer="{{ xml_attr(params.customer) }}"><card:customer>{{ xml_text(record.customer) }}</card:customer></card:Create></soap:Body></soap:Envelope>',
      },
      response: { kind: 'SOAP11', soapAction: 'urn:create', expectedStatus: 200,
        extract: { accountNumber: '/soap:Envelope/soap:Body/card:Created/card:number/text()' }, namespaces: { card: 'urn:synthetic:cards' } },
    } }],
  }
  const sut = { id: 'synthetic-ui', name: 'Synthetic UI only', description: 'Browser fixture, no SUT calls', endpoints: { cards: 'https://example.invalid/cards' } }
  const format = { sutId: sut.id, name: 'cards', description: 'Synthetic', lists: ['ready', 'returned'], fields: [{ name: 'accountNumber', type: 'string', required: true }] }
  const base = `/api/suts/${sut.id}/datasets/cards`
  const job = { id: 'ui-fixture-job', status: 'RUNNING', total: 2, completed: 0, published: 0, iteration: 1, step: 'Create card', error: '', inventoryId: '' }
  const failures = []

  async function fixture(allowed) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })
    const page = await context.newPage()
    const requests = []
    let stopped = false
    page.on('pageerror', error => failures.push(error.message))
    await context.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const key = url.pathname
      if (!key.startsWith('/api/')) { await route.continue(); return }
      const method = request.method()
      requests.push({ key, method, query: url.search, body: request.postData() })
      let value
      if (key === '/api/session') value = { user: allowed ? { username: 'fixture-admin', displayName: 'Synthetic fixture only' } : null, canEdit: allowed, configured: true }
      else if (key === '/api/info') value = { version: 'ui-fixture' }
      else if (key === '/api/connections') value = { redisConfigured: true, authConfigured: true }
      else if (key === '/api/catalog') value = { revision: 1, suts: [sut] }
      else if (key === `/api/suts/${sut.id}/datasets`) value = [{ format, counts: { ready: 0, returned: stopped ? 1 : 0 } }]
      else if (key === `${base}/inventory` && allowed) value = stopped ? [{ id: 'ui-inventory', bytes: 32 }] : []
      else if (key === `${base}/population` && method === 'POST' && allowed) value = job
      else if (key === `${base}/population/${job.id}` && allowed) value = { ...job, ...(stopped ? { status: 'STOPPED', completed: 1, published: 1, inventoryId: 'ui-inventory' } : {}) }
      else if (key === `${base}/population/${job.id}/stop` && method === 'POST' && allowed) {
        stopped = true
        value = { ...job, status: 'STOPPED', completed: 1, published: 1, inventoryId: 'ui-inventory' }
      } else if (key === `${base}/population/${job.id}/responses` && allowed) {
        await route.fulfill({ status: 200, contentType: 'text/csv', body: 'iteration,status\n1,200\n' })
        return
      } else {
        failures.push(`Unexpected fixture request: ${method} ${key}`)
        await route.fulfill({ status: 500, json: { error: 'Unexpected synthetic request' } })
        return
      }
      await route.fulfill({ status: 200, json: value })
    })
    try {
      await page.goto(`${origin}/#/population`)
      await page.getByRole('combobox', { name: 'Selected SUT' }).selectOption(sut.id)
      await page.getByRole('combobox', { name: 'DataSet', exact: true }).selectOption('cards')
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, 'fixture-failure.png') })
      throw new Error(`${error.message}\nPage: ${await page.locator('body').innerText()}\nErrors: ${JSON.stringify(failures)}\nRequests: ${JSON.stringify(requests)}`)
    }
    return { context, page, requests }
  }

  try {
    const viewer = await fixture(false)
    await viewer.page.getByText('Population requires local-admin').waitFor()
    assert.equal(await viewer.page.getByRole('textbox', { name: 'JSON script' }).count(), 0)
    assert.equal(viewer.requests.some(item => item.key.includes('/inventory') || item.key.includes('/population')), false)
    await viewer.context.close()

    const { context, page, requests } = await fixture(true)
    await page.getByRole('button', { name: 'Expand view sidebar' }).click()
    await page.getByText('Template and SOAP contract', { exact: true }).click()
    const help = page.locator('.pd-population-help')
    const helpText = await help.innerText()
    assert.match(helpText, /portable-v1/)
    assert.match(helpText, /json_string\(record.customer\)/)
    assert.match(helpText, /without surrounding quotes/)
    assert.match(helpText, /params.iteration/)
    assert.doesNotMatch(helpText, /payload|endpointPath|\bvars\b|\bctx\b/)
    await help.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-contract-desktop.png') })
    await help.locator('p').filter({ hasText: 'For dynamic JSON strings use' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-functions-desktop.png') })
    await page.getByText('Template and SOAP contract', { exact: true }).click()
    await page.getByRole('textbox', { name: 'JSON script' }).fill(JSON.stringify(recipe, null, 2))
    await page.getByRole('combobox', { name: 'Target list', exact: true }).selectOption('returned')
    await page.screenshot({ path: path.join(artifacts, 'population-desktop.png') })
    await page.getByRole('button', { name: 'Run script…', exact: true }).click()
    assert.equal(requests.filter(item => item.method === 'POST').length, 0)
    const confirmation = page.getByRole('dialog', { name: 'Run population script?' })
    await confirmation.waitFor()
    assert.match(await confirmation.innerText(), /synthetic-ui[\s\S]*cards[\s\S]*returned[\s\S]*Iterations[\s\S]*2/)
    await page.screenshot({ path: path.join(artifacts, 'population-confirmation.png') })
    await confirmation.getByRole('button', { name: 'Confirm Run' }).click()
    const status = page.getByRole('region', { name: 'Population job', exact: true })
    await status.getByRole('heading', { name: 'RUNNING', exact: true }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'JSON script' }).isDisabled(), true)
    assert.equal(await page.getByRole('combobox', { name: 'Selected SUT' }).isDisabled(), true)
    await page.waitForTimeout(1150)
    assert.equal(requests.filter(item => item.key === `${base}/population` && item.method === 'POST').length, 1)
    const start = requests.find(item => item.key === `${base}/population` && item.method === 'POST')
    assert.equal(start.query, '?list=returned')
    assert.deepEqual(JSON.parse(start.body), recipe)
    await status.getByRole('button', { name: 'Stop', exact: true }).click()
    await status.getByRole('heading', { name: 'STOPPED', exact: true }).waitFor()
    await page.getByRole('region', { name: 'Population inventory', exact: true }).getByText('ui-inventory', { exact: true }).waitFor()
    const download = page.waitForEvent('download')
    await status.getByRole('button', { name: 'Download response CSV' }).click()
    assert.equal((await download).suggestedFilename(), 'cards-ui-fixture-job-responses.csv')
    assert.equal(requests.filter(item => item.key.endsWith('/stop')).length, 1)
    await status.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-stopped.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Collapse view sidebar' }).click()
    await page.getByRole('heading', { name: 'Scripted population' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-mobile.png') })
    const layout = await page.evaluate(() => ({
      headers: document.querySelectorAll('header').length,
      mains: document.querySelectorAll('main').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      documentScroll: document.documentElement.scrollHeight > innerHeight,
      controlsClipped: [...document.querySelectorAll('.pd-population-editor input, .pd-population-editor select, .pd-population-editor textarea')].some(element => element.getBoundingClientRect().right > innerWidth),
    }))
    assert.deepEqual(layout, { headers: 1, mains: 1, horizontalOverflow: false, documentScroll: false, controlsClipped: false })
    await page.getByText('Template and SOAP contract', { exact: true }).click()
    await help.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-contract-mobile.png') })
    await help.locator('p').filter({ hasText: 'For dynamic JSON strings use' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'population-functions-mobile.png') })
    const helpLayout = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      documentScroll: document.documentElement.scrollHeight > innerHeight,
      helpClipped: document.querySelector('.pd-population-help').getBoundingClientRect().right > innerWidth,
    }))
    assert.deepEqual(helpLayout, { horizontalOverflow: false, documentScroll: false, helpClipped: false })
    assert.deepEqual(failures, [])
    await context.close()
    console.log(JSON.stringify({ syntheticUiOnly: true, realBackendExecutionVerified: false, sharedShell: true, viewerPermissions: true, explicitConfirmation: true, exactSoapRecipe: true, portableContractHelp: true, statusStopAndCsv: true, layout, helpLayout, pageErrors: 0, artifacts }, null, 2))
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
