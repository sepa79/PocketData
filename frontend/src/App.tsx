import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePocketAuth } from '@pockethive/browser-auth'
import { AppHeader, AppShell } from '@pockethive/ui'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { createProductApi } from './api/productApi'
import { createPopulationApi } from './api/populationApi'
import type { CatalogSnapshot, DatasetDefinition, SutDefinition } from './api/types'
import { DatasetEditor } from './components/DatasetEditor'
import { IdentityButton } from './components/IdentityButton'
import { SutEditor } from './components/SutEditor'
import { WorkspaceNavigation } from './components/WorkspaceNavigation'
import { useNotice } from './hooks/useNotice'
import { useWorkspace } from './hooks/useWorkspace'
import { usePopulation } from './hooks/usePopulation'
import { DatasetsView } from './views/DatasetsView'
import { InventoryView } from './views/InventoryView'
import { SutsView } from './views/SutsView'
import { HomeView } from './views/HomeView'
import { PopulationView } from './views/PopulationView'
import { DatasetDetailsView } from './views/DatasetDetailsView'

type Editor = { kind: 'sut'; catalog: CatalogSnapshot; original: SutDefinition | null } | { kind: 'dataset'; sut: string; original: DatasetDefinition | null }

export function App() {
  const { message, notify } = useNotice()
  const onAuthError = useCallback((failure: unknown) => notify(failure instanceof Error ? failure.message : String(failure)), [notify])
  const auth = usePocketAuth({ storageKey: 'POCKETDATA_AUTH_SESSION', onError: onAuthError })
  const api = useMemo(() => createProductApi(auth.fetchWithAuth), [auth.fetchWithAuth])
  const populationApi = useMemo(() => createPopulationApi(auth.fetchWithAuth), [auth.fetchWithAuth])
  const [selection] = useSearchParams()
  const workspace = useWorkspace(api, selection.get('sut') ?? '')
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [expanded, setExpanded] = useState(() => sessionStorage.getItem('PD_UI_NAV') === 'expanded')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [inventoryBusy, setInventoryBusy] = useState(false)
  const [inventoryRevision, setInventoryRevision] = useState(0)
  const selectedDataset = selection.get('dataset') || workspace.datasets[0]?.format.name || ''
  const dataset = workspace.datasets.find(item => item.format.name === selectedDataset)
  function navigateWorkspace(path: string, sut = workspace.sut, selected = selectedDataset) {
    const query = new URLSearchParams()
    if (sut) query.set('sut', sut)
    if (sut && selected) query.set('dataset', selected)
    navigate({ pathname: path, search: query.toString() })
  }
  const setRequestedDataset = (name: string) => navigateWorkspace(location.pathname, workspace.sut, name)
  const setExpandedPreference = (value: boolean) => { setExpanded(value); sessionStorage.setItem('PD_UI_NAV', value ? 'expanded' : 'collapsed') }
  useEffect(() => { if (!auth.session.canEdit) setEditor(null) }, [auth.session.canEdit])
  function refresh() { workspace.refresh(); setInventoryRevision(value => value + 1) }
  const population = usePopulation(populationApi, auth.session.canEdit, refresh)
  const busy = inventoryBusy || population.pending || population.active && auth.session.canEdit
  function saved(sut?: string) {
    setEditor(null)
    if (sut) navigateWorkspace('/datasets', sut, '')
    refresh()
    notify('Saved.')
  }

  return <>
    <AppShell navigationExpanded={expanded}
      header={<AppHeader leading={<div className="pd-brand"><Link to={`/${location.search}`} className="pd-brand-home" aria-label="PocketData home" aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }}><img src="/pocketdata-topbar.svg" alt="PocketData" /></Link><span id="version" className="pd-version">{workspace.version}</span></div>} center={null}
        trailing={<IdentityButton username={auth.session.user?.username ?? null} configured={auth.session.configured} loading={auth.loading} signingIn={auth.signingIn} locked={busy}
          signIn={auth.signIn} signOut={auth.signOut} cancelSignIn={auth.cancelSignIn} />} />}
      navigation={<WorkspaceNavigation expanded={expanded} onExpandedChange={setExpandedPreference} locked={busy} />}
      toolbar={isHome ? null : <div className="pd-workspace-toolbar"><label className="pd-context">Selected SUT<select id="sut-select" value={workspace.sut} onChange={event => navigateWorkspace(location.pathname === '/datasets/details' ? '/datasets' : location.pathname, event.target.value, '')} disabled={busy || workspace.catalogLoading}>
        <option value="">Select SUT</option>{workspace.sut && !workspace.catalog.suts.some(sut => sut.id === workspace.sut) ? <option value={workspace.sut}>{workspace.sut} (unavailable)</option> : null}{workspace.catalog.suts.map(sut => <option key={sut.id} value={sut.id}>{sut.name}</option>)}
      </select></label><button onClick={refresh} disabled={busy || workspace.catalogLoading || workspace.datasetLoading}>Refresh</button></div>}>
      {auth.signingIn || auth.confirmationUrl && auth.error?.code === 'popup_blocked' ? <div className="pd-auth-status" role="status"><span>{auth.signingIn ? 'Confirm sign-in in the PocketHive tab.' : 'Open PocketHive to confirm shared sign-out.'}</span><button onClick={auth.openConfirmation}>Open PocketHive</button></div> : null}
      {auth.error ? <p className="pd-error" role="alert">{auth.error.message}</p> : null}
      <Routes>
        <Route path="/" element={<HomeView connections={workspace.connections} refreshing={workspace.catalogLoading} onRefresh={refresh} />} />
        <Route path="/suts" element={<SutsView suts={workspace.catalog.suts} selected={workspace.sut} canEdit={auth.session.canEdit} loading={workspace.catalogLoading} error={workspace.catalogError}
          onNew={() => setEditor({ kind: 'sut', catalog: workspace.catalog, original: null })} onEdit={sut => setEditor({ kind: 'sut', catalog: workspace.catalog, original: sut })}
          onOpen={sut => navigateWorkspace('/datasets', sut, '')} />} />
        <Route path="/datasets" element={<DatasetsView sut={workspace.sut} datasets={workspace.datasets} canEdit={auth.session.canEdit} loading={workspace.datasetLoading} error={workspace.datasetError || workspace.catalogError}
          onNew={() => setEditor({ kind: 'dataset', sut: workspace.sut, original: null })} onOpen={name => navigateWorkspace('/datasets/details', workspace.sut, name)} />} />
        <Route path="/datasets/details" element={<DatasetDetailsView sut={workspace.sut} dataset={dataset} canEdit={auth.session.canEdit} loading={workspace.datasetLoading} error={workspace.datasetError || workspace.catalogError}
          redisCommanderUrl={workspace.connections.kind === 'ready' ? workspace.connections.configuration.redisCommanderUrl : ''}
          onBack={() => navigateWorkspace('/datasets')} onEdit={() => { if (dataset) setEditor({ kind: 'dataset', sut: workspace.sut, original: dataset.format }) }}
          onInventory={() => navigateWorkspace('/inventory')} onPopulation={() => navigateWorkspace('/population')} />} />
        <Route path="/inventory" element={<InventoryView key={`${workspace.sut}:${selectedDataset}`} api={api} sut={workspace.sut} datasets={workspace.datasets} selected={selectedDataset} onSelect={setRequestedDataset} canEdit={auth.session.canEdit}
          refreshing={workspace.datasetLoading} datasetError={workspace.datasetError || workspace.catalogError} revision={inventoryRevision} onBusyChange={setInventoryBusy} onImported={refresh} notify={notify} />} />
        <Route path="/population" element={<PopulationView key={workspace.sut} api={populationApi} productApi={api} controller={population} sut={workspace.catalog.suts.find(item => item.id === workspace.sut)} datasets={workspace.datasets}
          selected={selectedDataset} onSelect={setRequestedDataset} canEdit={auth.session.canEdit} refreshing={workspace.datasetLoading} datasetError={workspace.datasetError || workspace.catalogError} inventoryRevision={inventoryRevision} refreshInventory={refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    {editor && auth.session.canEdit ? editor.kind === 'sut' ? <SutEditor catalog={editor.catalog} original={editor.original} api={api} onClose={() => setEditor(null)} onSaved={saved} /> : <DatasetEditor sut={editor.sut} original={editor.original} api={api} onClose={() => setEditor(null)} onSaved={name => { setEditor(null); refresh(); navigateWorkspace('/datasets/details', editor.sut, name); notify('Saved.') }} /> : null}
    {message ? <div className="pd-notice" role="status" aria-live="polite">{message}</div> : null}
  </>
}
