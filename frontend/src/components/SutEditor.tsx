import { useState, type FormEvent } from 'react'
import type { ProductApi } from '../api/productApi'
import type { CatalogSnapshot, SutDefinition } from '../api/types'
import { Dialog } from './Dialog'
import { EditorActions } from './EditorActions'

export function SutEditor({ catalog, original, api, onClose, onSaved }: {
  catalog: CatalogSnapshot; original: SutDefinition | null; api: ProductApi; onClose: () => void; onSaved: (sut: string) => void
}) {
  const [id, setId] = useState(original?.id ?? '')
  const [name, setName] = useState(original?.name ?? '')
  const [description, setDescription] = useState(original?.description ?? '')
  const [endpoints, setEndpoints] = useState(JSON.stringify(original?.endpoints ?? {}, null, 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const definition = { id, name, description, endpoints: JSON.parse(endpoints) as SutDefinition['endpoints'] }
      const suts = original ? catalog.suts.map(sut => sut.id === original.id ? definition : sut) : [...catalog.suts, definition]
      await api.saveCatalog({ revision: catalog.revision, suts })
      onSaved(id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed.') }
    finally { setBusy(false) }
  }
  return <Dialog title={original ? 'Edit SUT' : 'New SUT'} busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <label>ID<input value={id} onChange={event => setId(event.target.value)} required pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} disabled={Boolean(original)} /></label>
        <label>Name<input value={name} onChange={event => setName(event.target.value)} required maxLength={150} /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} /></label>
        <label>Endpoints · JSON object of name → address<textarea value={endpoints} onChange={event => setEndpoints(event.target.value)} required spellCheck={false} rows={5} className="pd-code" /></label>
      </fieldset>
      <EditorActions busy={busy} error={error} onClose={onClose} />
    </form>
  </Dialog>
}
