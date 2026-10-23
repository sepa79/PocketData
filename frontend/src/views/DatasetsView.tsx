import type { DatasetSummary } from '../api/types'
import { EmptyState } from '../components/EmptyState'

export function DatasetsView({ sut, datasets, canEdit, loading, error, onNew, onOpen }: {
  sut: string; datasets: DatasetSummary[]; canEdit: boolean; loading: boolean; error: string; onNew: () => void; onOpen: (dataset: string) => void
}) {
  return <section aria-label="DataSets" className="pd-panel">
    <div className="pd-panel-toolbar"><h1>DataSets</h1>{canEdit ? <button id="new-dataset" className="pd-primary" onClick={onNew} disabled={!sut || loading || Boolean(error)}>＋ DataSet</button> : null}</div>
    <p className="pd-muted">Choose a DataSet to see its Redis lists, record format, saved CSV files and population options.</p>
    {!sut ? <EmptyState title="Select a SUT first">Only its DataSets will be shown.</EmptyState> : error ? <p role="alert" className="pd-error">DataSets unavailable: {error}</p> : loading ? <p role="status">Loading DataSets…</p> : datasets.length ? <div className="pd-table-scroll"><table className="pd-table">
      <caption className="pd-sr-only">DataSets in selected SUT</caption><thead><tr><th>DataSet</th><th>Description</th><th>Lists / records</th><th>Fields</th></tr></thead>
      <tbody>{datasets.map(({ format, counts }) => <tr key={format.name}>
        <th scope="row"><button className="pd-text-button" onClick={() => onOpen(format.name)}>{format.name}</button></th>
        <td className="pd-description">{format.description || '—'}</td>
        <td>{format.lists.map(list => <div className="pd-list-count" key={list}><code>{list}</code><span>{counts[list].toLocaleString()} records</span></div>)}</td>
        <td>{format.fields.length}</td>
      </tr>)}</tbody>
    </table></div> : <EmptyState title="No DataSets in this SUT">Create format metadata here or publish it from an external script using the same Redis naming convention.</EmptyState>}
  </section>
}
