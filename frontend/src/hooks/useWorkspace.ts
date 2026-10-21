import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProductApi } from '../api/productApi'
import type { CatalogSnapshot, DatasetSummary } from '../api/types'
import type { ConnectionState } from './ConnectionState'

export function useWorkspace(api: ProductApi) {
  const [catalog, setCatalog] = useState<CatalogSnapshot>({ revision: 0, suts: [] })
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [sut, setSut] = useState('')
  const [datasetResult, setDatasetResult] = useState<{ sut: string; items: DatasetSummary[]; loading: boolean; error: string }>({ sut: '', items: [], loading: false, error: '' })
  const datasets = datasetResult.sut === sut ? datasetResult.items : []
  const datasetLoading = Boolean(sut) && (datasetResult.sut !== sut || datasetResult.loading)
  const datasetError = datasetResult.sut === sut ? datasetResult.error : ''
  const [reload, setReload] = useState(0)
  const [version, setVersion] = useState('')
  const [connections, setConnections] = useState<ConnectionState>({ kind: 'loading' })
  const requestedSut = useRef(sut)
  requestedSut.current = sut
  const refresh = useCallback(() => setReload(value => value + 1), [])

  useEffect(() => {
    const abort = new AbortController()
    setCatalogLoading(true)
    setCatalogError('')
    setConnections({ kind: 'loading' })
    api.catalog(abort.signal).then(result => {
      if (abort.signal.aborted) return
      setCatalog(result)
      if (!result.suts.some(item => item.id === requestedSut.current)) setSut('')
    }).catch(error => { if (!abort.signal.aborted) setCatalogError(error.message) })
      .finally(() => { if (!abort.signal.aborted) setCatalogLoading(false) })
    api.connections(abort.signal).then(result => {
      if (!abort.signal.aborted) setConnections({ kind: 'ready', configuration: result })
    }).catch(error => { if (!abort.signal.aborted) setConnections({ kind: 'error', message: error.message }) })
    return () => abort.abort()
  }, [api, reload])

  useEffect(() => {
    const abort = new AbortController()
    api.info(abort.signal).then(result => { if (!abort.signal.aborted) setVersion(`v${result.version}`) })
      .catch(() => { if (!abort.signal.aborted) setVersion('Version unavailable') })
    return () => abort.abort()
  }, [api])

  useEffect(() => {
    const abort = new AbortController()
    setDatasetResult({ sut, items: [], loading: Boolean(sut), error: '' })
    if (sut) api.datasets(sut, abort.signal)
      .then(items => { if (!abort.signal.aborted) setDatasetResult({ sut, items, loading: false, error: '' }) })
      .catch(error => { if (!abort.signal.aborted) setDatasetResult({ sut, items: [], loading: false, error: error.message }) })
    return () => abort.abort()
  }, [api, sut, reload])

  return { catalog, catalogLoading, catalogError, sut, setSut, datasets, datasetLoading, datasetError, version, connections, refresh }
}
