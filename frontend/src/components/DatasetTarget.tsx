import type { DatasetSummary } from '../api/types'
import { FieldHelp } from './FieldHelp'
import { RedisKey } from './RedisKey'

export function DatasetTarget({ sut, datasets, selected, list, locked, onSelect, onList }: {
  sut: string; datasets: DatasetSummary[]; selected: string; list: string; locked: boolean; onSelect: (name: string) => void; onList: (name: string) => void
}) {
  const dataset = datasets.find(item => item.format.name === selected)?.format
  const details = `#/datasets/details?${new URLSearchParams({ sut, dataset: selected })}`
  return <div className="pd-target">
    <div className="pd-form-grid">
      <FieldHelp label="DataSet" hint="Only DataSets belonging to Selected SUT." details="This selection controls the record format, CSV inventory and Redis list prefix. Switching DataSets does not move or publish records.">{description => <select aria-label="DataSet" aria-describedby={description} value={selected} onChange={event => onSelect(event.target.value)} disabled={locked}>
        {!datasets.length ? <option value="">No DataSets available</option> : null}{selected && !dataset ? <option value={selected}>{selected} (unavailable)</option> : null}{datasets.map(item => <option key={item.format.name} value={item.format.name}>{item.format.name}</option>)}
      </select>}</FieldHelp>
      <FieldHelp label="Target list" hint="List name; the full Redis key appears below." details="Records are appended to this list after CSV has been saved. The SUT and DataSet prefix is fixed. Existing records are not cleared or moved.">{description => <select aria-label="Target list" aria-describedby={description} value={list} onChange={event => onList(event.target.value)} disabled={locked || !dataset}>
        {!dataset?.lists.length ? <option value="">No lists available</option> : null}{dataset?.lists.map(name => <option key={name} value={name}>{name}</option>)}
      </select>}</FieldHelp>
    </div>
    {dataset && list ? <div className="pd-key-preview"><span className="pd-field-hint">Full Redis key</span><RedisKey sut={sut} dataset={selected} list={list} /></div> : null}
    {dataset ? <a href={details} aria-disabled={locked || undefined} onClick={event => { if (locked) event.preventDefault() }}>View DataSet format and lists →</a> : selected && datasets.length ? <p role="alert" className="pd-error">Selected DataSet is unavailable. Choose an existing DataSet.</p> : null}
  </div>
}
