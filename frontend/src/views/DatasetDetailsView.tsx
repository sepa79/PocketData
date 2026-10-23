import type { DatasetSummary } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { RedisKey } from '../components/RedisKey'

export function DatasetDetailsView({ sut, dataset, canEdit, loading, error, redisCommanderUrl, onBack, onEdit, onInventory, onPopulation }: {
  sut: string; dataset: DatasetSummary | undefined; canEdit: boolean; loading: boolean; error: string
  redisCommanderUrl: string
  onBack: () => void; onEdit: () => void; onInventory: () => void; onPopulation: () => void
}) {
  return <section className="pd-panel" aria-label="DataSet details">
    <div className="pd-panel-toolbar"><button onClick={onBack}>← DataSets</button>{canEdit && dataset && !loading && !error ? <button onClick={onEdit}>Edit DataSet</button> : null}</div>
    {!sut ? <EmptyState title="Select a SUT first">A DataSet belongs to one environment.</EmptyState> : error ? <p role="alert" className="pd-error">{error}</p> : loading ? <p role="status">Loading DataSet…</p> : !dataset ? <EmptyState title="DataSet not found">Return to DataSets and select an existing definition.</EmptyState> : <>
      <div className="pd-card"><h1>{dataset.format.name}</h1><p className="pd-description">{dataset.format.description || 'No description yet.'}</p>
        <div className="pd-actions"><button onClick={onInventory}>CSV inventory & import</button><button onClick={onPopulation}>Populate with a script</button></div>
        <p className="pd-muted">Import existing records from CSV, or create them through this SUT's endpoints. Generated records are saved as CSV before publication to Redis.</p>
      </div>
      <section className="pd-card" aria-label="Redis lists"><h2>Redis lists</h2><p className="pd-muted">The bold suffix is the list name. PH Providers and Executors use the full Redis key.</p>
        {redisCommanderUrl ? <p><a href={redisCommanderUrl} target="_blank" rel="noopener noreferrer" title="Browse live records in Redis Commander. Find the list using its full Redis key from the table below.">Open Redis Commander ↗</a></p> : null}
        <div className="pd-table-scroll"><table className="pd-table"><caption className="pd-sr-only">Redis list names, full keys and record counts</caption><thead><tr><th>List name</th><th>Full Redis key</th><th>Records</th></tr></thead><tbody>{dataset.format.lists.map(list => <tr key={list}><th scope="row">{list}</th><td><RedisKey sut={sut} dataset={dataset.format.name} list={list} /></td><td>{dataset.counts[list].toLocaleString()}</td></tr>)}</tbody></table></div>
        <p className="pd-muted">Format metadata: <code>{sut}:{dataset.format.name}:meta:format</code></p>
      </section>
      <section className="pd-card" aria-label="Record format"><h2>Record format</h2><p className="pd-muted">Required means a column must exist. Extra fields remain in the record; each Scenario uses its own subset.</p>
        <div className="pd-table-scroll"><table className="pd-table"><caption className="pd-sr-only">Record fields</caption><thead><tr><th>Field name</th><th>Type</th><th>Required column</th></tr></thead><tbody>{dataset.format.fields.map(field => <tr key={field.name}><th scope="row"><code>{field.name}</code></th><td>{field.type}</td><td>{field.required ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </section>
}
