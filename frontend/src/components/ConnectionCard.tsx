export function ConnectionCard({ name, configured, description }: { name: string; configured: boolean; description: string }) {
  return <article className="pd-card pd-connection-card" aria-label={name}>
    <div className="pd-card-heading"><h2>{name}</h2><span className={`pd-connection-state${configured ? ' pd-connection-configured' : ''}`}>
      <span aria-hidden="true" className="pd-status-dot" />{configured ? 'Configured' : 'Not configured'}
    </span></div>
    <p className="pd-muted">{description}</p>
  </article>
}
