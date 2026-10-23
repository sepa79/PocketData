import { useId, type ReactNode } from 'react'

export function FieldHelp({ label, hint, details, children }: {
  label: string; hint: string; details: string; children: (descriptionId: string) => ReactNode
}) {
  const identity = useId()
  return <div className="pd-field">
    <div className="pd-field-label"><span>{label}</span><span className="pd-help">
      <button type="button" aria-label={`Help: ${label}`} aria-describedby={`${identity}-details`}>?</button>
      <span role="tooltip" id={`${identity}-details`}>{details}</span>
    </span></div>
    {children(`${identity}-hint`)}
    <p id={`${identity}-hint`} className="pd-field-hint">{hint}</p>
  </div>
}
