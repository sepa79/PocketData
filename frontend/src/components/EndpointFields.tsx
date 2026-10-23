import { FieldHelp } from './FieldHelp'
import { PhDocs } from './PhDocs'

export interface EndpointRow { name: string; address: string }

export function EndpointFields({ rows, onChange }: { rows: EndpointRow[]; onChange: (rows: EndpointRow[]) => void }) {
  const replace = (index: number, value: Partial<EndpointRow>) => onChange(rows.map((row, position) => position === index ? { ...row, ...value } : row))
  return <section className="pd-editor-section" aria-label="Endpoints">
    <div className="pd-card-heading"><h2>Endpoints</h2><button type="button" disabled={rows.length >= 30} onClick={() => onChange([...rows, { name: '', address: '' }])}>Add endpoint</button></div>
    <p className="pd-muted">Name a service address, then use that name in a population step. <PhDocs page="templates">PH endpoint and template binding</PhDocs></p>
    {!rows.length ? <p className="pd-muted">No endpoints yet. CSV import does not need one.</p> : null}
    {rows.map((row, index) => <div className="pd-edit-row" key={index}>
      <FieldHelp label={`Endpoint name ${index + 1}`} hint="For example: cards" details="The script's step.endpoint selects this name. Use 1–64 lowercase letters, digits, underscores or hyphens. Names must be unique within this SUT.">{description => <input aria-label={`Endpoint name ${index + 1}`} aria-describedby={description} value={row.name} required pattern="[a-z0-9][a-z0-9_-]{0,63}" maxLength={64} onChange={event => replace(index, { name: event.target.value })} />}</FieldHelp>
      <FieldHelp label={`Address ${index + 1}`} hint="Full URL, including the service path." details="Use an explicit HTTP(S) or TCP(S) URL, without credentials, query parameters or fragment. Population currently calls HTTP(S) only. The path is available as endpoint.path in portable templates.">{description => <input aria-label={`Address ${index + 1}`} aria-describedby={description} value={row.address} required maxLength={2048} placeholder="https://test.example/cards" onChange={event => replace(index, { address: event.target.value })} />}</FieldHelp>
      <button type="button" aria-label={`Remove endpoint ${index + 1}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>Remove</button>
    </div>)}
  </section>
}
