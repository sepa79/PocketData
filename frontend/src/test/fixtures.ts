import type { CatalogSnapshot, DatasetSummary } from '../api/types'

export const catalog: CatalogSnapshot = {
  revision: 7,
  suts: [
    { id: 'synthetic-a', name: 'Synthetic A', description: '<script>not executable</script>', endpoints: { api: 'https://example.invalid' } },
    { id: 'synthetic-b', name: 'Synthetic B', description: 'Other test environment', endpoints: {} },
  ],
}
export const datasets: DatasetSummary[] = [{
  format: { sutId: 'synthetic-a', name: 'cards', description: 'Test records only', fields: [{ name: 'accountNumber', type: 'string', required: true }], lists: ['ready', 'returned'] },
  counts: { ready: 12, returned: 0 },
}]

export function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

export function syntheticFetch() {
  return async (input: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const path = String(input)
    if (path === '/api/catalog') return response(catalog)
    if (path === '/api/info') return response({ version: '0.1.0-dev' })
    if (path === '/api/connections') return response({ redisConfigured: true, authConfigured: true, redisCommanderUrl: 'https://redis.example.test/' })
    if (path === '/api/suts/synthetic-a/datasets' && !options?.method) return response(datasets)
    if (path === '/api/suts/synthetic-b/datasets' && !options?.method) return response([])
    if (path.endsWith('/inventory')) return response([{ id: '00000000-0000-0000-0000-000000000001', bytes: 120 }])
    throw new Error(`Unexpected synthetic request: ${path}`)
  }
}
