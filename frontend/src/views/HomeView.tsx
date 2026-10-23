import { Link, useLocation } from 'react-router-dom'
import { ConnectionCard } from '../components/ConnectionCard'
import type { ConnectionState } from '../hooks/ConnectionState'

export function HomeView({ connections, refreshing, onRefresh }: { connections: ConnectionState; refreshing: boolean; onRefresh: () => void }) {
  const { search } = useLocation()
  return <div className="pd-home">
    <section className="pd-home-hero" aria-label="PocketData home">
      <h1><img src="/pocketdata-logo.svg" alt="PocketData" /></h1>
      <p className="pd-muted">Prepare test data. Share it across PocketHive swarms.</p>
    </section>
    <nav className="pd-home-shortcuts" aria-label="Workspace shortcuts">
      <Link className="pd-card pd-home-shortcut" to={`/suts${search}`}><h2>SUTs <span aria-hidden="true">→</span></h2><p className="pd-muted">Define environments and their endpoints.</p></Link>
      <Link className="pd-card pd-home-shortcut" to={`/datasets${search}`}><h2>DataSets <span aria-hidden="true">→</span></h2><p className="pd-muted">Browse record formats and live Redis lists.</p></Link>
      <Link className="pd-card pd-home-shortcut" to={`/inventory${search}`}><h2>CSV inventory <span aria-hidden="true">→</span></h2><p className="pd-muted">Import, save and publish test data.</p></Link>
    </nav>
    <section className="pd-home-connections" aria-labelledby="connections-title">
      <div className="pd-panel-toolbar"><h2 id="connections-title">Connections</h2><button onClick={onRefresh} disabled={refreshing || connections.kind === 'loading'}>Refresh</button></div>
      {connections.kind === 'loading' ? <p className="pd-muted" role="status">Loading connection configuration…</p> : connections.kind === 'error' ? <p className="pd-error" role="alert">Connection configuration unavailable: {connections.message}</p> : <div className="pd-home-connection-grid">
        <ConnectionCard name="Redis" configured={connections.configuration.redisConfigured} description="The selected PocketHive Redis holds live DataSet records and format metadata." />
        <ConnectionCard name="PocketHive Auth" configured={connections.configuration.authConfigured} description="Shared sign-in through PocketHive. Anonymous access is view-only; local-admin can edit." />
      </div>}
      <p className="pd-muted pd-configuration-note">Configuration only — not a live health check. Service availability is checked when used.</p>
    </section>
  </div>
}
