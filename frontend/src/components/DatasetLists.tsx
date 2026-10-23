import { FieldHelp } from './FieldHelp'
import { RedisKey } from './RedisKey'

export function DatasetLists({ sut, dataset, lists, original, onChange }: {
  sut: string; dataset: string; lists: string[]; original: string[] | null; onChange: (lists: string[]) => void
}) {
  return <section className="pd-editor-section" aria-label="Redis lists">
    <div className="pd-card-heading"><h2>Redis lists</h2><button type="button" disabled={lists.length >= 50} onClick={() => onChange([...lists, ''])}>Add list</button></div>
    <p className="pd-muted">Edit only the list name. The SUT and DataSet supply the prefix.</p>
    {lists.map((list, index) => <div className="pd-list-editor" key={index}>
      <FieldHelp label={`List name ${index + 1}`} hint="For example: ready or returned" details="Use 1–64 lowercase letters, digits, underscores or hyphens. Each list name is unique within the DataSet. Existing lists cannot be renamed or removed; adding a list does not insert records.">{description => <input aria-label={`List name ${index + 1}`} aria-describedby={description} value={list} required disabled={index < (original?.length ?? 0)} pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} onChange={event => onChange(lists.map((value, position) => position === index ? event.target.value : value))} />}</FieldHelp>
      <div className="pd-key-preview"><span className="pd-field-hint">Full Redis key</span><RedisKey sut={sut} dataset={dataset} list={list} /></div>
      {index >= (original?.length ?? 0) ? <button type="button" aria-label={`Remove list ${index + 1}`} disabled={lists.length === 1} onClick={() => onChange(lists.filter((_, position) => position !== index))}>Remove</button> : null}
    </div>)}
  </section>
}
