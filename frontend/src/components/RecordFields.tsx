import type { RecordField } from '../api/types'
import { FieldHelp } from './FieldHelp'

export function RecordFields({ fields, original, onChange }: { fields: RecordField[]; original: RecordField[] | null; onChange: (fields: RecordField[]) => void }) {
  const replace = (index: number, value: Partial<RecordField>) => onChange(fields.map((field, position) => position === index ? { ...field, ...value } : field))
  return <section className="pd-editor-section" aria-label="Record fields">
    <div className="pd-card-heading"><h2>Record fields</h2><button type="button" disabled={fields.length >= 200} onClick={() => onChange([...fields, { name: '', type: 'string', required: false }])}>Add field</button></div>
    <p className="pd-muted">Use shared names across tests. Extra CSV columns stay in the record; a Scenario can use only the fields it needs.</p>
    {original ? <p className="pd-muted">Existing definitions stay fixed. You can add optional fields without changing existing records.</p> : null}
    {fields.map((field, index) => {
      const fixed = index < (original?.length ?? 0)
      return <div className="pd-edit-row pd-record-row" key={index}>
        <FieldHelp label={`Field name ${index + 1}`} hint="For example: accountNumber" details="The exact CSV column and record property name. Start with a letter; use letters, digits or underscore, up to 80 characters. Names are case-sensitive and unique.">{description => <input aria-label={`Field name ${index + 1}`} aria-describedby={description} value={field.name} disabled={fixed} required pattern="[A-Za-z][A-Za-z0-9_]{0,79}" maxLength={80} onChange={event => replace(index, { name: event.target.value })} />}</FieldHelp>
        <FieldHelp label={`Type ${index + 1}`} hint="Use text for card/account IDs." details="Text preserves leading zeroes. Whole number accepts integers; decimal accepts numbers; true/false accepts exactly those lowercase values. A supplied optional value must still match its type.">{description => <select aria-label={`Type ${index + 1}`} aria-describedby={description} value={field.type} disabled={fixed} onChange={event => replace(index, { type: event.target.value as RecordField['type'] })}><option value="string">Text</option><option value="integer">Whole number</option><option value="number">Decimal</option><option value="boolean">True / false</option></select>}</FieldHelp>
        <FieldHelp label={`Required ${index + 1}`} hint="Column must be present." details="Required checks that a CSV column exists, not that every text value is non-empty. New fields on an existing DataSet must be optional; existing records are not rewritten.">{description => <input type="checkbox" aria-label={`Required ${index + 1}`} aria-describedby={description} checked={field.required} disabled={Boolean(original)} onChange={event => replace(index, { required: event.target.checked })} />}</FieldHelp>
        {!fixed ? <button type="button" aria-label={`Remove field ${index + 1}`} disabled={fields.length === 1} onClick={() => onChange(fields.filter((_, position) => position !== index))}>Remove</button> : null}
      </div>
    })}
  </section>
}
