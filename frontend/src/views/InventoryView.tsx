import { useRef, useState } from 'react'
import type { ProductApi } from '../api/productApi'
import type { DatasetSummary } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { useInventory } from '../hooks/useInventory'
import { DatasetTarget } from '../components/DatasetTarget'
import { FieldHelp } from '../components/FieldHelp'
import { CsvInventoryHelp } from '../components/CsvInventoryHelp'

export function InventoryView({ api, sut, datasets, selected, onSelect, canEdit, refreshing, datasetError, revision, onBusyChange, onImported, notify }: {
  api: ProductApi; sut: string; datasets: DatasetSummary[]; selected: string; onSelect: (name: string) => void; canEdit: boolean
  refreshing: boolean; datasetError: string; revision: number; onBusyChange: (busy: boolean) => void; onImported: () => void; notify: (message: string) => void
}) {
  const dataset = datasets.find(item => item.format.name === selected)?.format
  const [requestedList, setRequestedList] = useState('')
  const list = dataset?.lists.includes(requestedList) ? requestedList : dataset?.lists[0] ?? ''
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloadId, setDownloadId] = useState('')
  const [result, setResult] = useState('')
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const importing = useRef(false)
  const inventory = useInventory(api, sut, selected, canEdit && Boolean(dataset), revision)

  async function importCsv() {
    if (!canEdit || importing.current || !dataset || !file || !list) return
    if (file.size > 25 * 1024 * 1024) { setImportError('CSV limit is 25 MiB per import.'); return }
    importing.current = true
    setBusy(true)
    onBusyChange(true)
    setResult('')
    setImportError('')
    try {
      const saved = await api.importCsv(sut, dataset.name, list, file)
      const message = `Saved CSV ${saved.id}. Published ${saved.published} records.`
      setResult(message)
      notify(message)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      onImported()
    } catch (failure) {
      const message = `${failure instanceof Error ? failure.message : 'Import failed.'} No automatic retry. If the outcome is uncertain, check saved inventory and Redis before another import.`
      setImportError(message)
      notify(message)
    } finally {
      importing.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  async function download(id: string) {
    if (!canEdit || downloadId || !dataset) return
    setDownloadId(id)
    try {
      const content = await api.download(sut, dataset.name, id)
      const url = URL.createObjectURL(content)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${dataset.name}-${id}.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { notify(failure instanceof Error ? failure.message : 'Download failed.') }
    finally { setDownloadId('') }
  }

  return <section aria-label="CSV inventory" className="pd-panel">
    <div className="pd-panel-toolbar"><h1>CSV inventory</h1></div>
    {!sut ? <EmptyState title="Select a SUT first">Inventory is grouped by SUT and DataSet.</EmptyState> : datasetError ? <p role="alert" className="pd-error">DataSets unavailable: {datasetError}</p> : <>
      <div className="pd-card pd-import">
        <DatasetTarget sut={sut} datasets={datasets} selected={selected} list={list} locked={busy || refreshing} onSelect={name => { onSelect(name); setResult(''); setImportError(''); setFile(null); if (fileInput.current) fileInput.current.value = '' }} onList={setRequestedList} />
        {canEdit ? <><FieldHelp label="CSV file · UTF-8 · up to 25 MiB" hint="Header row with the DataSet's required columns." details="Comma-separated UTF-8 CSV, up to 25 MiB and 200 columns. Extra columns are preserved; text IDs keep leading zeroes. Validation finishes before a durable copy is saved and records are appended to Redis.">{description => <input aria-label="CSV file · UTF-8 · up to 25 MiB" aria-describedby={description} ref={fileInput} type="file" accept=".csv,text/csv" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(''); setImportError('') }} disabled={busy || refreshing || !dataset} />}</FieldHelp>
          <button className="pd-primary" onClick={() => void importCsv()} disabled={busy || refreshing || !dataset || !list || !file}>{busy ? 'Saving and publishing…' : 'Import to Redis'}</button></> : null}
        <p className="pd-muted">Validate → save on the persistent volume → publish to Redis. Imports add records; they do not create accounts/cards in the SUT. No automatic clearing, retry or repopulation.</p>
        {busy ? <p role="status">Import in progress. Keep this view open; do not submit the same CSV twice.</p> : null}
        {result ? <p role="status" className="pd-success">{result}</p> : null}
        {importError ? <p role="alert" className="pd-error">{importError}</p> : null}
      </div>
      {!canEdit ? <EmptyState title="Raw inventory requires local-admin">Sign in through PocketHive to import and download CSV files.</EmptyState> : !dataset ? <EmptyState title="Select a DataSet">Create or select its format before importing CSV.</EmptyState> : inventory.error ? <p role="alert" className="pd-error">{inventory.error}</p> : inventory.loading ? <p role="status">Loading saved CSV files…</p> : <div className="pd-card">
        <h2>Saved CSV files</h2>
        <CsvInventoryHelp />
        {inventory.files.length ? <ul className="pd-inventory-list">{inventory.files.map(saved => <li key={saved.id}><code>{saved.id}</code><span className="pd-muted">{Math.ceil(saved.bytes / 1024)} KiB</span><button disabled={busy || Boolean(downloadId)} onClick={() => void download(saved.id)}>{downloadId === saved.id ? 'Downloading…' : 'Download'}</button></li>)}</ul> : <p className="pd-muted">No CSV inventory files saved yet.</p>}
      </div>}
    </>}
  </section>
}
