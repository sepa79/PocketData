import { Link } from 'react-router-dom'
import type { ProductApi } from '../api/productApi'
import { useInventory } from '../hooks/useInventory'
import { CsvInventoryHelp } from './CsvInventoryHelp'

export function PopulationInventory({ api, sut, dataset, revision, locked, refresh }: {
  api: ProductApi; sut: string; dataset: string; revision: number; locked: boolean; refresh: () => void
}) {
  const inventory = useInventory(api, sut, dataset, true, revision)
  return <section className="pd-card" aria-label="Population inventory">
    <div className="pd-card-heading"><h2>Saved CSV inventory</h2><button disabled={inventory.loading || locked} onClick={refresh}>Refresh inventory</button></div>
    <CsvInventoryHelp />
    {inventory.loading ? <p role="status">Loading saved CSV files…</p> : inventory.error ? <p role="alert" className="pd-error">{inventory.error}</p> : <>
      <p className="pd-muted">{inventory.files.length} saved CSV files for {sut} / {dataset}.</p>
      {inventory.files.length ? <ul className="pd-population-inventory">{inventory.files.map(file => <li key={file.id}><code>{file.id}</code><span className="pd-muted">{Math.ceil(file.bytes / 1024)} KiB</span></li>)}</ul> : null}
    </>}
    {!locked ? <Link to={`/inventory?${new URLSearchParams({ sut, dataset })}`}>Open CSV inventory and downloads</Link> : null}
  </section>
}
