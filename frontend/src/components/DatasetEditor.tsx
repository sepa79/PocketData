import { useState, type FormEvent } from 'react'
import type { ProductApi } from '../api/productApi'
import type { DatasetDefinition, RecordField } from '../api/types'
import { Dialog } from './Dialog'
import { EditorActions } from './EditorActions'
import { FieldHelp } from './FieldHelp'
import { RecordFields } from './RecordFields'
import { DatasetLists } from './DatasetLists'

export function DatasetEditor({ sut, api, original = null, onClose, onSaved }: {
  sut: string; api: ProductApi; original?: DatasetDefinition | null; onClose: () => void; onSaved: (name: string) => void
}) {
  const [name, setName] = useState(original?.name ?? '')
  const [description, setDescription] = useState(original?.description ?? '')
  const [lists, setLists] = useState(original?.lists ?? ['ready'])
  const [fields, setFields] = useState<RecordField[]>(original?.fields ?? [{ name: '', type: 'string', required: true }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const definition = { sutId: sut, name, description, lists, fields }
      if (original) await api.updateDataset(original, definition)
      else await api.createDataset(definition)
      onSaved(name)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed.') }
    finally { setBusy(false) }
  }
  return <Dialog title={original ? 'Edit DataSet' : 'New DataSet'} busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <p className="pd-muted">Selected SUT: <strong>{sut}</strong></p>
      <fieldset disabled={busy}>
        <FieldHelp label="Name / Redis namespace" hint="A stable name shared by all lists in this DataSet." details="Use 1–64 lowercase letters, digits, underscores or hyphens. This becomes part of every Redis key and cannot change after creation.">{hint => <input aria-label="Name / Redis namespace" aria-describedby={hint} value={name} onChange={event => setName(event.target.value)} disabled={Boolean(original)} required pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} />}</FieldHelp>
        <FieldHelp label="Description" hint="What data is here and which tests use it?" details="Up to 2,000 characters of public descriptive text. Do not put credentials or card/account values here.">{hint => <textarea aria-label="Description" aria-describedby={hint} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} />}</FieldHelp>
        <DatasetLists sut={sut} dataset={name} lists={lists} original={original?.lists ?? null} onChange={setLists} />
        <RecordFields fields={fields} original={original?.fields ?? null} onChange={setFields} />
      </fieldset>
      <EditorActions busy={busy} error={error} onClose={onClose} />
    </form>
  </Dialog>
}
