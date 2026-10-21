import { useState, type FormEvent } from 'react'
import type { ProductApi } from '../api/productApi'
import type { RecordField } from '../api/types'
import { Dialog } from './Dialog'
import { EditorActions } from './EditorActions'

export function DatasetEditor({ sut, api, onClose, onSaved }: { sut: string; api: ProductApi; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [lists, setLists] = useState('cards')
  const [fields, setFields] = useState('[]')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.createDataset({ sutId: sut, name, description, lists: lists.split(',').map(list => list.trim()), fields: JSON.parse(fields) as RecordField[] })
      onSaved()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed.') }
    finally { setBusy(false) }
  }
  return <Dialog title="New DataSet" busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <p className="pd-muted">SUT: <strong>{sut}</strong></p>
      <fieldset disabled={busy}>
        <label>Name / Redis namespace<input value={name} onChange={event => setName(event.target.value)} required pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} /></label>
        <label>Data lists · comma separated<input value={lists} onChange={event => setLists(event.target.value)} required /></label>
        <label>Record fields · JSON array<textarea value={fields} onChange={event => setFields(event.target.value)} required spellCheck={false} rows={6} className="pd-code" /></label>
      </fieldset>
      <p className="pd-muted">Each field has name, type (string, integer, number, boolean) and required. Extra CSV fields are preserved. Metadata is created once, never silently replaced.</p>
      <EditorActions busy={busy} error={error} onClose={onClose} />
    </form>
  </Dialog>
}
