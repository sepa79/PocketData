import { useMemo, useRef, useState } from 'react'
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
import { DatasetTarget } from '../components/DatasetTarget'
import { FieldHelp } from '../components/FieldHelp'
import { PhDocs } from '../components/PhDocs'
import { RedisKey } from '../components/RedisKey'
import { PopulationControls } from '../components/PopulationControls'
import { describePacing } from '../components/populationPacing'
import { readPopulationScript, scriptLimit } from './populationScript'

export function PopulationView({ api, productApi, controller, sut, datasets, selected, onSelect, canEdit, refreshing, datasetError, inventoryRevision, refreshInventory }: {
  api: PopulationApi; productApi: ProductApi; controller: PopulationController; sut: SutDefinition | undefined; datasets: DatasetSummary[]
  selected: string; onSelect: (name: string) => void; canEdit: boolean; refreshing: boolean; datasetError: string; inventoryRevision: number; refreshInventory: () => void
}) {
  const dataset = datasets.find(item => item.format.name === selected)?.format
  const [requestedList, setRequestedList] = useState('')
  const list = dataset?.lists.includes(requestedList) ? requestedList : dataset?.lists[0] ?? ''
  const [script, setScript] = useState(() => JSON.stringify(example, null, 2))
  const parsed = useMemo(() => readPopulationScript(script), [script])
  const [error, setError] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [confirmation, setConfirmation] = useState<{ target: PopulationTarget; recipe: PopulationRecipe } | null>(null)
  const confirmed = useRef(false)
  const locked = controller.pending || controller.active
  const currentSelection = useRef('')
  currentSelection.current = `${sut?.id}/${selected}/${canEdit}`

  async function loadDraft() {
    if (!canEdit || locked || loadingFile || !sut || !dataset || confirmation) return
    const selection = currentSelection.current
    setLoadingFile(true)
    setError('')
    try {
      const draft = await api.draft({ sut: sut.id, dataset: dataset.name, list })
      if (currentSelection.current !== selection) return
      if (!draft.recipe) { setError('No saved script for this SUT / DataSet. Ask your agent to save a population draft.'); return }
      if (!dataset.lists.includes(draft.list)) { setError('The saved script targets a list that no longer exists. Ask your agent to review it.'); return }
      setScript(JSON.stringify(draft.recipe, null, 2))
      setRequestedList(draft.list)
    } catch (failure) {
      if (currentSelection.current === selection) setError(`Script not loaded: ${failure instanceof Error ? failure.message : 'Saved draft unavailable.'}`)
    } finally { setLoadingFile(false) }
  }

  async function loadFile(file: File | undefined) {
    if (!file || locked || !canEdit || loadingFile) return
    setError('')
    if (file.size > scriptLimit) { setError('JSON script limit is 1 MiB.'); return }
    setLoadingFile(true)
    try {
      const text = await file.text()
      setScript(text)
    } catch (failure) {
      setError(`Script not loaded: ${failure instanceof Error ? failure.message : 'Invalid JSON file.'}`)
    } finally { setLoadingFile(false) }
  }

  function prepare() {
    if (!canEdit || locked || loadingFile || !sut || !dataset || !list || !parsed.recipe || parsed.error) return
    setError('')
    confirmed.current = false
    setConfirmation({ target: { sut: sut.id, dataset: dataset.name, list }, recipe: parsed.recipe })
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
        <DatasetTarget sut={sut.id} datasets={datasets} selected={selected} list={list} locked={locked || refreshing || loadingFile} onSelect={onSelect} onList={setRequestedList} />
        {!canEdit ? <EmptyState title="Population requires local-admin">Sign in through PocketHive to load scripts, run requests and read response CSV.</EmptyState> : <>
          {parsed.recipe ? <section aria-label="Current script">
            <h2>{parsed.recipe.name}</h2>
            <p className="pd-muted">Steps: {parsed.recipe.steps.map(step => `${step.name} (${step.endpoint})`).join(' → ')}</p>
          </section> : null}
          <PopulationControls recipe={parsed.recipe} locked={locked || loadingFile || Boolean(confirmation)} onChange={recipe => { setScript(JSON.stringify(recipe, null, 2)); setError('') }} />
          {parsed.error ? <p className="pd-error" role="alert">{parsed.error}</p> : null}
          <FieldHelp label="Saved script from agent" hint="Load the shared draft for this DataSet; nothing runs automatically." details="Replaces the editor script, parameters, pacing and target list with the draft saved through MCP. Review these settings, then use Run script and confirm separately. Loading or saving never creates cards or publishes records.">{description => <button aria-describedby={description} disabled={locked || loadingFile || refreshing || !dataset || Boolean(confirmation)} onClick={() => void loadDraft()}>Load saved script</button>}</FieldHelp>
          <FieldHelp label="Load JSON script · up to 1 MiB" hint="Load a population recipe with portable HTTP/SOAP calls." details="A UTF-8 JSON recipe, not an executable JavaScript or Groovy file. Loading replaces the editor content only; requests start after Run and confirmation. PH variables.yaml is not a population recipe.">{description => <input aria-label="Load JSON script · up to 1 MiB" aria-describedby={description} type="file" accept=".json,application/json" disabled={locked || loadingFile || refreshing || !dataset}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void loadFile(file) }} />}</FieldHelp>
          <details className="pd-population-advanced"><summary>Advanced / Script</summary><div>
          <FieldHelp label="JSON script" hint="This recipe also owns the iterations and pacing shown above." details="The shared portable-v1 contract renders record, params and endpoint.path. Recipe values seed each record; params configure the requests. Extracted response fields join the record. Each step selects an endpoint name from this SUT. No variables.yaml is loaded or merged automatically.">{description => <textarea aria-label="JSON script" aria-describedby={description} className="pd-code pd-population-script" spellCheck={false} rows={14} value={script} maxLength={scriptLimit} disabled={locked || loadingFile || Boolean(confirmation)}
            onChange={event => { setScript(event.target.value); setError('') }} />}</FieldHelp>
          <p className="pd-muted"><PhDocs page="templates">PH portable HTTP/SOAP templates</PhDocs> · <PhDocs page="variables">PH Scenario variables</PhDocs>. Population uses recipe params; Scenario variables.yaml is not imported here.</p>
          <details className="pd-population-help"><summary>Template and SOAP contract</summary>
            <p>JSON recipes only — no JavaScript, Groovy, eval or SpEL. The server validates the complete recipe before execution; unsupported profiles/capabilities and legacy fields fail, with no automatic rewriting. No redirects, automatic retries or automatic resume.</p>
            <p>A recipe has <code>name</code>, <code>count</code>, <code>pacing</code>, <code>values</code>, <code>params</code> and <code>steps</code>. Pacing requires <code>mode</code> (DELAY / RATE), numeric <code>value</code> and <code>unit</code> (MILLISECONDS / SECONDS / MINUTES / HOURS / DAYS). RATE excludes MILLISECONDS, must be positive and allows intervals of at least 1 nanosecond. DELAY allows zero or an interval of at least 1 millisecond. Both modes limit intervals to 365 days. Each step has <code>name</code>, a named SUT <code>endpoint</code> and <code>call</code>. The reusable PH call has exactly <code>profile: 'portable-v1'</code>, <code>requires</code>, <code>request</code> and <code>response</code>.</p>
            <p>Only <code>record</code>, <code>params</code> and <code>endpoint.path</code> are available in templates. String-only <code>values</code> seed the record; extracted fields join it. String-only <code>params</code> are independent. Leading-zero IDs stay strings. PD overwrites reserved <code>params.iteration</code> with a one-based numeric string for each iteration. Use <code>{'{{ endpoint.path }}'}</code> for the selected endpoint path, or an origin-relative route such as <code>/accounts</code>. Absolute URLs are rejected.</p>
            <p>Declare every used capability explicitly in <code>requires</code>: <code>json_path</code>, <code>json_string</code>, <code>xml_path</code>, <code>xml_text</code>, <code>xml_attr</code>, <code>soap11</code> or <code>soap12</code>. JSON responses require <code>json_path</code>; SOAP requires <code>xml_path</code> and its version capability. Unknown or duplicate capabilities fail.</p>
            <p>Read JSON with <code>{"json_path(record, '/field')"}</code> or XML with <code>xml_path(source, xpath, namespaceMap)</code>. For dynamic JSON strings use <code>{'{{ json_string(record.customer) }}'}</code> without surrounding quotes: it returns the full quoted JSON string, escaping quotes, backslashes and control characters. Escape XML text with <code>xml_text(record.accountNumber)</code> and attributes with <code>xml_attr(record.accountNumber)</code>. No automatic JSON/XML escaping or conversion.</p>
            <p><code>request</code> is the standard PH HTTP definition: <code>serviceId</code>, <code>callId</code>, <code>protocol: 'HTTP'</code>, literal <code>method</code>, <code>pathTemplate</code>, <code>bodyTemplate</code> and <code>headersTemplate</code>. No authRef or resultRules. <code>response</code> has exactly <code>kind</code> (JSON / SOAP11 / SOAP12), <code>soapAction</code> (empty for JSON), <code>expectedStatus</code> (explicit 2xx), <code>extract</code> and <code>namespaces</code>.</p>
            <p>JSON extraction uses RFC6901 pointers. SOAP extraction uses namespace-aware XPath: <code>soap</code> is reserved and automatic; declare application prefixes in <code>response.namespaces</code>. The backend sets SOAP Content-Type/action; do not repeat Content-Type or SOAPAction in request headers.</p>
            <dl className="pd-endpoints">{Object.entries(sut.endpoints).map(([name, address]) => <div key={name}><dt>{name}</dt><dd>{address}</dd></div>)}</dl>
          </details>
          </div></details>
          <p className="pd-muted">This can create real accounts/cards in the selected SUT. Responses are saved to audit CSV; final records go to durable CSV inventory before Redis publication. Nothing is rolled back on Stop or failure.</p>
          {loadingFile ? <p role="status">Loading script…</p> : null}
          <div className="pd-actions"><button className="pd-primary" onClick={prepare} disabled={locked || loadingFile || refreshing || !dataset || !list || Boolean(error || parsed.error)}>{controller.pending && !controller.run ? 'Starting…' : 'Run script…'}</button></div>
        </>}
        {error ? <p className="pd-error" role="alert">{error}</p> : null}
      </div>
    </>}
    {canEdit && controller.error ? <p className="pd-error" role="alert">{controller.error}</p> : null}
    {canEdit ? <PopulationRunStatus api={api} controller={controller} /> : null}
    {canEdit && sut && dataset && !datasetError ? <PopulationInventory api={productApi} sut={sut.id} dataset={dataset.name} revision={inventoryRevision} locked={locked} refresh={refreshInventory} /> : null}
    {confirmation && canEdit ? <Dialog title="Run population script?" busy={controller.pending} onClose={() => setConfirmation(null)}>
      <p className="pd-description">{confirmation.recipe.name}</p>
      <dl className="pd-counts pd-population-confirmation"><div><dt>SUT</dt><dd>{confirmation.target.sut}</dd></div><div><dt>DataSet</dt><dd>{confirmation.target.dataset}</dd></div><div><dt>Redis list</dt><dd><RedisKey sut={confirmation.target.sut} dataset={confirmation.target.dataset} list={confirmation.target.list} /></dd></div><div><dt>Iterations</dt><dd>{confirmation.recipe.count}</dd></div></dl>
      <p>{describePacing(confirmation.recipe.pacing)}</p>
      {confirmation.recipe.pacing.mode === 'RATE' ? <p className="pd-muted">Single executor; no catch-up bursts.</p> : null}
      <p className="pd-muted">Requests affect this SUT. Saved responses and generated records can contain sensitive data. No automatic retry or rollback; check inventory before repeating an uncertain run.</p>
      <div className="pd-dialog-actions"><button disabled={controller.pending} onClick={() => setConfirmation(null)}>Cancel</button><button className="pd-primary" disabled={locked || refreshing || loadingFile} onClick={() => void confirmRun()}>{controller.pending ? 'Starting…' : 'Confirm Run'}</button></div>
    </Dialog> : null}
  </section>
}
