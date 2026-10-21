import { useEffect, useState } from 'react'
import type { ProductApi } from '../api/productApi'
import type { InventoryFile } from '../api/types'

export function useInventory(api: ProductApi, sut: string, dataset: string, canEdit: boolean, revision: number) {
  const key = `${sut}/${dataset}/${revision}`
  const enabled = Boolean(sut && dataset && canEdit)
  const [result, setResult] = useState<{ key: string; files: InventoryFile[]; error: string; loading: boolean }>({ key: '', files: [], error: '', loading: false })
  useEffect(() => {
    const abort = new AbortController()
    setResult({ key, files: [], error: '', loading: enabled })
    if (enabled) api.inventory(sut, dataset, abort.signal)
      .then(files => { if (!abort.signal.aborted) setResult({ key, files, error: '', loading: false }) })
      .catch(failure => { if (!abort.signal.aborted) setResult({ key, files: [], error: failure.message, loading: false }) })
    return () => abort.abort()
  }, [api, sut, dataset, enabled, key])
  return { files: enabled && result.key === key ? result.files : [], loading: enabled && (result.key !== key || result.loading), error: enabled && result.key === key ? result.error : '' }
}
