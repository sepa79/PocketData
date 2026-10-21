import type { SutDefinition } from '../api/types'
import { EmptyState } from '../components/EmptyState'

export function SutsView({ suts, selected, canEdit, loading, error, onNew, onEdit, onOpen }: {
  suts: SutDefinition[]; selected: string; canEdit: boolean; loading: boolean; error: string
  onNew: () => void; onEdit: (sut: SutDefinition) => void; onOpen: (sut: string) => void
}) {
  return <section aria-label="Systems under test" className="pd-panel">
    <div className="pd-panel-toolbar"><h1>Systems under test</h1>{canEdit ? <button id="new-sut" className="pd-primary" onClick={onNew} disabled={loading || Boolean(error)}>＋ SUT</button> : null}</div>
    {error ? <p role="alert" className="pd-error">{error}</p> : loading ? <p role="status">Loading SUTs…</p> : suts.length ? <div className="pd-cards">{suts.map(sut => <article className={`pd-card${sut.id === selected ? ' pd-selected' : ''}`} key={sut.id}>
      <div className="pd-card-heading"><h2>{sut.name}</h2><span className="pd-badge">SUT</span></div>
      <code className="pd-muted">{sut.id}</code><p className="pd-description">{sut.description}</p>
      <dl className="pd-endpoints">{Object.entries(sut.endpoints).map(([name, address]) => <div key={name}><dt>{name}</dt><dd>{address}</dd></div>)}</dl>
      <div className="pd-actions"><button onClick={() => onOpen(sut.id)}>Open DataSets →</button>{canEdit ? <button onClick={() => onEdit(sut)}>Edit</button> : null}</div>
    </article>)}</div> : <EmptyState title="No SUTs yet">Add an environment to group its DataSets. Editing requires PocketHive local-admin.</EmptyState>}
  </section>
}
