import { describe, expect, it, vi } from 'vitest'
import { ApiError, createProductApi, requireSuccess } from './productApi'
import { catalog, response } from '../test/fixtures'

describe('product API transport', () => {
  it('sends the expected revision and whole catalogue without inventing a new revision', async () => {
    const fetcher = vi.fn(async () => response({ ...catalog, revision: 8 }))
    await createProductApi(fetcher).saveCatalog(catalog)
    expect(fetcher).toHaveBeenCalledWith('/api/catalog', expect.objectContaining({ method: 'PUT', body: JSON.stringify(catalog), cache: 'no-store' }))
  })
  it('encodes namespace components and sends raw CSV without converting record fields', async () => {
    const fetcher = vi.fn(async () => response({ id: 'synthetic', published: 1 }))
    const file = new File(['accountNumber,extra\n001,keep\n'], 'synthetic.csv')
    await createProductApi(fetcher).importCsv('sut/test', 'cards a', 'ready+new', file)
    expect(fetcher).toHaveBeenCalledWith('/api/suts/sut%2Ftest/datasets/cards%20a/import?list=ready%2Bnew', expect.objectContaining({ method: 'POST', body: file, headers: { 'Content-Type': 'text/csv' } }))
  })
  it('does not replay an uncertain import', async () => {
    const fetcher = vi.fn(async () => { throw new Error('Connection lost') })
    await expect(createProductApi(fetcher).importCsv('sut', 'cards', 'ready', new File(['a'], 'a.csv'))).rejects.toThrow('Connection lost')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('preserves status and explicit backend errors including stale catalogue writes', async () => {
    await expect(requireSuccess(response({ error: 'Reload before saving.' }, 409))).rejects.toMatchObject({ status: 409, message: 'Reload before saving.' })
    await expect(requireSuccess(new Response('gateway', { status: 502 }))).rejects.toEqual(new ApiError('Request failed (502).', 502))
  })
})
