import { useState, type FormEvent } from 'react'
import type { ProductApi } from '../api/productApi'
import type { CatalogSnapshot, SutDefinition } from '../api/types'
import { Dialog } from './Dialog'
import { EditorActions } from './EditorActions'
import { FieldHelp } from './FieldHelp'
import { EndpointFields, type EndpointRow } from './EndpointFields'

export function SutEditor({ catalog, original, api, onClose, onSaved }: {
  catalog: CatalogSnapshot; original: SutDefinition | null; api: ProductApi; onClose: () => void; onSaved: (sut: string) => void
}) {
  const [id, setId] = useState(original?.id ?? '')
  const [name, setName] = useState(original?.name ?? '')
  const [description, setDescription] = useState(original?.description ?? '')
  const [endpoints, setEndpoints] = useState<EndpointRow[]>(Object.entries(original?.endpoints ?? {}).map(([name, address]) => ({ name, address })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (new Set(endpoints.map(endpoint => endpoint.name)).size !== endpoints.length) throw new Error('Endpoint names must be unique.')
      const definition = { id, name, description, endpoints: Object.fromEntries(endpoints.map(endpoint => [endpoint.name, endpoint.address])) }
      const suts = original ? catalog.suts.map(sut => sut.id === original.id ? definition : sut) : [...catalog.suts, definition]
      await api.saveCatalog({ revision: catalog.revision, suts })
      onSaved(id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed.') }
    finally { setBusy(false) }
  }
  return <Dialog title={original ? 'Edit SUT' : 'New SUT'} busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <FieldHelp label="ID" hint="Stable Redis namespace for this environment." details="Use 1–64 lowercase letters, digits, underscores or hyphens. The ID prefixes every DataSet key and cannot be changed after creation.">{hint => <input aria-label="ID" aria-describedby={hint} value={id} onChange={event => setId(event.target.value)} required pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} disabled={Boolean(original)} />}</FieldHelp>
        <FieldHelp label="Name" hint="The environment name shown in Selected SUT." details="A human-readable name, up to 150 characters. Changing this label does not rename Redis keys.">{hint => <input aria-label="Name" aria-describedby={hint} value={name} onChange={event => setName(event.target.value)} required maxLength={150} />}</FieldHelp>
        <FieldHelp label="Description" hint="Explain which environment this represents." details="Public descriptive text, up to 2,000 characters. Credentials and sensitive account/card data do not belong here.">{hint => <textarea aria-label="Description" aria-describedby={hint} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} />}</FieldHelp>
        <EndpointFields rows={endpoints} onChange={setEndpoints} />
      </fieldset>
      <EditorActions busy={busy} error={error} onClose={onClose} />
    </form>
  </Dialog>
}
