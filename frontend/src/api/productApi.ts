import type { AuthenticatedFetch, CatalogSnapshot, ConnectionConfiguration, DatasetDefinition, DatasetSummary, ImportResult, InventoryFile } from './types'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function requireSuccess(response: Response): Promise<Response> {
  if (response.ok) return response
  let message = `Request failed (${response.status}).`
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') message = body.error
  } catch {}
  throw new ApiError(message, response.status)
}

export function createProductApi(fetchWithAuth: AuthenticatedFetch) {
  async function json<Result>(path: string, options: RequestInit = {}): Promise<Result> {
    const response = await requireSuccess(await fetchWithAuth(path, { ...options, cache: 'no-store' }))
    return response.json() as Promise<Result>
  }
  const namespace = (sut: string) => `/api/suts/${encodeURIComponent(sut)}/datasets`
  const datasetPath = (sut: string, dataset: string) => `${namespace(sut)}/${encodeURIComponent(dataset)}`
  const write = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return {
    catalog: (signal?: AbortSignal) => json<CatalogSnapshot>('/api/catalog', { signal }),
    info: (signal?: AbortSignal) => json<{ version: string }>('/api/info', { signal }),
    connections: (signal?: AbortSignal) => json<ConnectionConfiguration>('/api/connections', { signal }),
    datasets: (sut: string, signal?: AbortSignal) => json<DatasetSummary[]>(namespace(sut), { signal }),
    saveCatalog: (catalog: CatalogSnapshot) => json<CatalogSnapshot>('/api/catalog', write('PUT', catalog)),
    createDataset: (format: DatasetDefinition) => json<DatasetDefinition>(namespace(format.sutId), write('POST', format)),
    updateDataset: (expected: DatasetDefinition, definition: DatasetDefinition) => json<DatasetDefinition>(datasetPath(expected.sutId, expected.name), write('PUT', { expected, definition })),
    inventory: (sut: string, dataset: string, signal?: AbortSignal) => json<InventoryFile[]>(`${datasetPath(sut, dataset)}/inventory`, { signal }),
    importCsv: (sut: string, dataset: string, list: string, file: File) => json<ImportResult>(`${datasetPath(sut, dataset)}/import?list=${encodeURIComponent(list)}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: file }),
    download: async (sut: string, dataset: string, id: string) => {
      const response = await requireSuccess(await fetchWithAuth(`${datasetPath(sut, dataset)}/inventory/${encodeURIComponent(id)}`, { cache: 'no-store' }))
      return response.blob()
    },
  }
}

export type ProductApi = ReturnType<typeof createProductApi>
