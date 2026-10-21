import { useRef, useState } from 'react'
import type { PopulationApi } from '../api/populationApi'
import type { ProductApi } from '../api/productApi'
import type { PopulationRecipe, PopulationTarget } from '../api/populationTypes'
import type { DatasetSummary, SutDefinition } from '../api/types'
import { Dialog } from '../components/Dialog'
import { EmptyState } from '../components/EmptyState'
import { PopulationRunStatus } from '../components/PopulationRunStatus'
import { PopulationInventory } from '../components/PopulationInventory'
import example from '../data/population-example.json'
import type { PopulationController } from '../hooks/usePopulation'

const scriptLimit = 1024 * 1024

export function PopulationView({ api, productApi, controller, sut, datasets, selected, onSelect, canEdit, refreshing, datasetError, inventoryRevision, refreshInventory }: {
  api: PopulationApi; productApi: ProductApi; controller: PopulationController; sut: SutDefinition | undefined; datasets: DatasetSummary[]
  selected: string; onSelect: (name: string) => void; canEdit: boolean; refreshing: boolean; datasetError: string; inventoryRevision: number; refreshInventory: () => void
}) {
  const dataset = datasets.find(item => item.format.name === selected)?.format
  const [requestedList, setRequestedList] = useState('')
  const list = dataset?.lists.includes(requestedList) ? requestedList : dataset?.lists[0] ?? ''
  const [script, setScript] = useState(() => JSON.stringify(example, null, 2))
  const [error, setError] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [confirmation, setConfirmation] = useState<{ target: PopulationTarget; recipe: PopulationRecipe } | null>(null)
  const confirmed = useRef(false)
  const locked = controller.pending || controller.active

  async function loadFile(file: File | undefined) {
    if (!file || locked || !canEdit || loadingFile) return
    setError('')
    if (file.size > scriptLimit) { setError('JSON script limit is 1 MiB.'); return }
    setLoadingFile(true)
    try {
      const text = await file.text()
      JSON.parse(text)
      setScript(text)
    } catch (failure) {
      setError(`Script not loaded: ${failure instanceof Error ? failure.message : 'Invalid JSON file.'}`)
    } finally { setLoadingFile(false) }
  }

  function prepare() {
    if (!canEdit || locked || loadingFile || !sut || !dataset || !list) return
    setError('')
    try {
      if (script.length > scriptLimit) throw new Error('JSON script limit is 1 MiB.')
      const recipe = JSON.parse(script) as PopulationRecipe
      if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('The script must be a JSON object, not JavaScript or Groovy.')
      if (typeof recipe.name !== 'string' || !recipe.name.trim()) throw new Error('The script needs a name.')
      if (!Number.isInteger(recipe.count) || recipe.count < 1 || recipe.count > 1000) throw new Error('Set count to 1–1000 iterations.')
      confirmed.current = false
      setConfirmation({ target: { sut: sut.id, dataset: dataset.name, list }, recipe })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid JSON script.') }
  }

  async function confirmRun() {
    if (!confirmation || !canEdit || locked || confirmed.current) return
    confirmed.current = true
    await controller.start(confirmation.target, confirmation.recipe)
    setConfirmation(null)
  }

  return <section className="pd-panel" aria-label="Scripted population">
    <div className="pd-panel-toolbar"><h1>Scripted population</h1><span className="pd-muted">One active job per server</span></div>
    {!sut ? <EmptyState title="Select a SUT first">Population uses only its named HTTP(S) endpoints and DataSets.</EmptyState> : datasetError ? <p role="alert" className="pd-error">DataSets unavailable: {datasetError}</p> : <>
      <div className="pd-card pd-population-editor">
        <div className="pd-form-grid">
          <label>DataSet<select value={selected} onChange={event => onSelect(event.target.value)} disabled={locked || refreshing || loadingFile}>
            {!datasets.length ? <option value="">No DataSets available</option> : null}{datasets.map(item => <option key={item.format.name} value={item.format.name}>{item.format.name}</option>)}
          </select></label>
          <label>Target list<select value={list} onChange={event => setRequestedList(event.target.value)} disabled={locked || refreshing || loadingFile || !dataset}>
            {!dataset?.lists.length ? <option value="">No lists available</option> : null}{dataset?.lists.map(name => <option key={name} value={name}>{name}</option>)}
          </select></label>
        </div>
        {!canEdit ? <EmptyState title="Population requires local-admin">Sign in through PocketHive to load scripts, run requests and read response CSV.</EmptyState> : <>
          <label>Load JSON script · up to 1 MiB<input type="file" accept=".json,application/json" disabled={locked || loadingFile || refreshing || !dataset}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void loadFile(file) }} /></label>
          <label>JSON script<textarea className="pd-code pd-population-script" spellCheck={false} rows={14} value={script} maxLength={scriptLimit} disabled={locked || loadingFile}
            onChange={event => { setScript(event.target.value); setError('') }} /></label>
          <details className="pd-population-help"><summary>Template and SOAP contract</summary>
            <p>JSON recipes only — no JavaScript, Groovy, eval or SpEL. The server validates the complete recipe before execution; unsupported profiles/capabilities and legacy fields fail, with no automatic rewriting. No redirects, automatic retries or automatic resume.</p>
            <p>A recipe has <code>name</code>, <code>count</code>, <code>values</code>, <code>params</code> and <code>steps</code>. Each step has <code>name</code>, a named SUT <code>endpoint</code> and <code>call</code>. The reusable PH call has exactly <code>profile: 'portable-v1'</code>, <code>requires</code>, <code>request</code> and <code>response</code>.</p>
            <p>Only <code>record</code>, <code>params</code> and <code>endpoint.path</code> are available in templates. String-only <code>values</code> seed the record; extracted fields join it. String-only <code>params</code> are independent. Leading-zero IDs stay strings. PD overwrites reserved <code>params.iteration</code> with a one-based numeric string for each iteration. Use <code>{'{{ endpoint.path }}'}</code> for the selected endpoint path, or an origin-relative route such as <code>/accounts</code>. Absolute URLs are rejected.</p>
            <p>Declare every used capability explicitly in <code>requires</code>: <code>json_path</code>, <code>json_string</code>, <code>xml_path</code>, <code>xml_text</code>, <code>xml_attr</code>, <code>soap11</code> or <code>soap12</code>. JSON responses require <code>json_path</code>; SOAP requires <code>xml_path</code> and its version capability. Unknown or duplicate capabilities fail.</p>
            <p>Read JSON with <code>{"json_path(record, '/field')"}</code> or XML with <code>xml_path(source, xpath, namespaceMap)</code>. For dynamic JSON strings use <code>{'{{ json_string(record.customer) }}'}</code> without surrounding quotes: it returns the full quoted JSON string, escaping quotes, backslashes and control characters. Escape XML text with <code>xml_text(record.accountNumber)</code> and attributes with <code>xml_attr(record.accountNumber)</code>. No automatic JSON/XML escaping or conversion.</p>
            <p><code>request</code> is the standard PH HTTP definition: <code>serviceId</code>, <code>callId</code>, <code>protocol: 'HTTP'</code>, literal <code>method</code>, <code>pathTemplate</code>, <code>bodyTemplate</code> and <code>headersTemplate</code>. No authRef or resultRules. <code>response</code> has exactly <code>kind</code> (JSON / SOAP11 / SOAP12), <code>soapAction</code> (empty for JSON), <code>expectedStatus</code> (explicit 2xx), <code>extract</code> and <code>namespaces</code>.</p>
            <p>JSON extraction uses RFC6901 pointers. SOAP extraction uses namespace-aware XPath: <code>soap</code> is reserved and automatic; declare application prefixes in <code>response.namespaces</code>. The backend sets SOAP Content-Type/action; do not repeat Content-Type or SOAPAction in request headers.</p>
            <dl className="pd-endpoints">{Object.entries(sut.endpoints).map(([name, address]) => <div key={name}><dt>{name}</dt><dd>{address}</dd></div>)}</dl>
          </details>
          <p className="pd-muted">This can create real accounts/cards in the selected SUT. Responses are saved to audit CSV; final records go to durable CSV inventory before Redis publication. Nothing is rolled back on Stop or failure.</p>
          {loadingFile ? <p role="status">Loading script…</p> : null}
          <div className="pd-actions"><button className="pd-primary" onClick={prepare} disabled={locked || loadingFile || refreshing || !dataset || !list || Boolean(error)}>{controller.pending && !controller.run ? 'Starting…' : 'Run script…'}</button></div>
        </>}
        {error ? <p className="pd-error" role="alert">{error}</p> : null}
      </div>
    </>}
    {canEdit && controller.error ? <p className="pd-error" role="alert">{controller.error}</p> : null}
    {canEdit ? <PopulationRunStatus api={api} controller={controller} /> : null}
    {canEdit && sut && dataset && !datasetError ? <PopulationInventory api={productApi} sut={sut.id} dataset={dataset.name} revision={inventoryRevision} locked={locked} refresh={refreshInventory} /> : null}
    {confirmation && canEdit ? <Dialog title="Run population script?" busy={controller.pending} onClose={() => setConfirmation(null)}>
      <p className="pd-description">{confirmation.recipe.name}</p>
      <dl className="pd-counts pd-population-confirmation"><div><dt>SUT</dt><dd>{confirmation.target.sut}</dd></div><div><dt>DataSet</dt><dd>{confirmation.target.dataset}</dd></div><div><dt>Redis list</dt><dd>{confirmation.target.list}</dd></div><div><dt>Iterations</dt><dd>{confirmation.recipe.count}</dd></div></dl>
      <p className="pd-muted">Requests affect this SUT. Saved responses and generated records can contain sensitive data. No automatic retry or rollback; check inventory before repeating an uncertain run.</p>
      <div className="pd-dialog-actions"><button disabled={controller.pending} onClick={() => setConfirmation(null)}>Cancel</button><button className="pd-primary" disabled={locked || refreshing || loadingFile} onClick={() => void confirmRun()}>{controller.pending ? 'Starting…' : 'Confirm Run'}</button></div>
    </Dialog> : null}
  </section>
}
