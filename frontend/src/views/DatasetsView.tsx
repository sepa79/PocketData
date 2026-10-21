import type { DatasetSummary } from '../api/types'
import { EmptyState } from '../components/EmptyState'

export function DatasetsView({ sut, datasets, canEdit, loading, error, onNew, onInventory }: {
  sut: string; datasets: DatasetSummary[]; canEdit: boolean; loading: boolean; error: string; onNew: () => void; onInventory: (dataset: string) => void
}) {
  return <section aria-label="DataSets" className="pd-panel">
    <div className="pd-panel-toolbar"><h1>DataSets</h1>{canEdit ? <button id="new-dataset" className="pd-primary" onClick={onNew} disabled={!sut || loading || Boolean(error)}>＋ DataSet</button> : null}</div>
    {!sut ? <EmptyState title="Select a SUT first">Only its DataSets will be shown.</EmptyState> : error ? <p role="alert" className="pd-error">DataSets unavailable: {error}</p> : loading ? <p role="status">Loading DataSets…</p> : datasets.length ? <div className="pd-cards">{datasets.map(({ format, counts }) => <article className="pd-card" key={format.name}>
      <div className="pd-card-heading"><h2>{format.name}</h2><span className="pd-badge">REDIS</span></div>
      <p className="pd-description">{format.description}</p><code className="pd-muted">{format.sutId}:{format.name}:*</code>
      <div className="pd-field-chips">{format.fields.map(field => <span className="pd-field-chip" key={field.name}>{field.name} · {field.type}{field.required ? ' *' : ''}</span>)}</div>
      <dl className="pd-counts">{Object.entries(counts).map(([list, count]) => <div key={list}><dt>{list}</dt><dd>{count.toLocaleString()} records</dd></div>)}</dl>
      <button onClick={() => onInventory(format.name)}>CSV inventory →</button>
    </article>)}</div> : <EmptyState title="No DataSets in this SUT">Create format metadata here or publish it from an external script using the same Redis naming convention.</EmptyState>}
  </section>
}
