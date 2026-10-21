import {readFile} from 'node:fs/promises';
import {parseArgs, isDeepStrictEqual} from 'node:util';
import {setTimeout as pause} from 'node:timers/promises';

const {values} = parseArgs({options: {
  origin: {type: 'string'}, 'auth-origin': {type: 'string'},
  id: {type: 'string', default: 'pocketdata-demo'}, confirm: {type: 'boolean', default: false}
}});
if (!values.confirm) throw new Error('Explicit --confirm is required to add persistent synthetic demo data.');
for (const key of ['origin', 'auth-origin']) {
  const address = new URL(values[key]);
  if (address.protocol !== 'http:' || address.hostname !== 'localhost' || address.pathname !== '/' || address.search || address.hash || address.username || address.password)
    throw new Error('Demo setup requires explicitly selected native http://localhost origins.');
  values[key] = address.origin;
}
if (values.id !== 'pocketdata-demo' && !/^pd-ph-qa-[a-z0-9-]+$/.test(values.id)) throw new Error('Only the demo or an isolated acceptance namespace may be seeded.');
const load = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const sut = {...await load('../examples/demo/sut.json'), id: values.id};
const dataset = {...await load('../examples/demo/dataset.json'), sutId: values.id};
const recipe = {...await load('../frontend/src/data/population-example.json'), count: 3};

async function api(origin, path, method = 'GET', body, token) {
  const response = await fetch(origin + path, {method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  if (!response.ok) throw new Error(method + ' ' + path + ' failed with HTTP ' + response.status + '; no automatic retry.');
  return response.json();
}

const login = await api(values['auth-origin'], '/auth-service/api/auth/dev/login', 'POST', {username: 'local-admin'});
if (typeof login.accessToken !== 'string' || !login.accessToken) throw new Error('PH did not issue a DEV identity token.');
const call = (path, method, body) => api(values.origin, path, method, body, login.accessToken);
const session = await call('/api/session');
if (!session.canEdit) throw new Error('PH identity does not have PocketData edit permission.');
const catalog = await call('/api/catalog');
const existing = catalog.suts.find(item => item.id === sut.id);
if (existing && !isDeepStrictEqual(existing, sut)) throw new Error('Demo SUT already exists with different settings; nothing overwritten.');
if (!existing) await call('/api/catalog', 'PUT', {revision: catalog.revision, suts: [...catalog.suts, sut]});
const base = '/api/suts/' + sut.id + '/datasets';
const datasets = await call(base);
const found = datasets.find(item => item.format.name === dataset.name);
if (found && !isDeepStrictEqual(found.format, dataset)) throw new Error('Demo DataSet already has a different format; nothing overwritten.');
if (!found) await call(base, 'POST', dataset);
const target = base + '/' + dataset.name;
const inventory = await call(target + '/inventory');
if (inventory.length) {
  console.log('Existing demo inventory detected; no new population was attempted. Inspect Inventory/DataSets for current records.');
} else {
  const current = (await call(base)).find(item => item.format.name === dataset.name);
  if (Object.values(current.counts).some(count => count !== 0)) throw new Error('Demo lists are nonempty without inventory; inspect before creating more resources.');
  let job = await call(target + '/population?list=ready', 'POST', recipe);
  const deadline = Date.now() + 120000;
  while (['RUNNING', 'STOPPING'].includes(job.status) && Date.now() < deadline) {
    await pause(500);
    job = await call(target + '/population/' + job.id);
  }
  if (job.status !== 'SUCCEEDED' || job.completed !== 3 || job.published !== 3)
    throw new Error('Demo creation did not confirm three published records. Inspect job ' + job.id + '; do not automatically repeat.');
  console.log('Created 3 synthetic account/card records with JSON, SOAP11 and SOAP12; CSV and Redis publication confirmed.');
}
console.log('Ready: ' + values.origin + '/#/population — select ' + sut.name + ' / ' + dataset.name + ' / ready.');
