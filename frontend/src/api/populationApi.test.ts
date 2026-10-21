import { describe, expect, it, vi } from 'vitest'
import { createPopulationApi } from './populationApi'
import { response } from '../test/fixtures'
import { populationJob, populationRecipe, populationTarget } from '../test/populationFixtures'

describe('population API', () => {
  it('posts the exact JSON recipe and encoded target through the supplied authenticated client', async () => {
    const fetcher = vi.fn(async () => response(populationJob))
    await expect(createPopulationApi(fetcher).start({ sut: 'sut/a', dataset: 'cards new', list: 'ready+' }, populationRecipe)).resolves.toEqual(populationJob)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/suts/sut%2Fa/datasets/cards%20new/population?list=ready%2B', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(populationRecipe), cache: 'no-store',
    })
  })
  it('reads status with an abort signal and stops only the exact job', async () => {
    const fetcher = vi.fn(async () => response(populationJob))
    const api = createPopulationApi(fetcher)
    const abort = new AbortController()
    await api.status(populationTarget, 'job/a', abort.signal)
    await api.stop(populationTarget, 'job/a')
    expect(fetcher.mock.calls).toEqual([
      ['/api/suts/synthetic-a/datasets/cards/population/job%2Fa', { signal: abort.signal, cache: 'no-store' }],
      ['/api/suts/synthetic-a/datasets/cards/population/job%2Fa/stop', { method: 'POST', cache: 'no-store' }],
    ])
  })
  it('downloads protected audit CSV through authenticated fetch, without tokens in a URL', async () => {
    const fetcher = vi.fn(async () => new Response('iteration,status\n1,200\n', { headers: { 'Content-Type': 'text/csv' } }))
    const blob = await createPopulationApi(fetcher).responses(populationTarget, 'job/a')
    expect(blob.type).toBe('text/csv')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/suts/synthetic-a/datasets/cards/population/job%2Fa/responses', { cache: 'no-store' })
  })
  it('preserves server validation and permission failures without retrying', async () => {
    const fetcher = vi.fn(async () => response({ error: 'Active local-admin required.' }, 403))
    await expect(createPopulationApi(fetcher).start(populationTarget, populationRecipe)).rejects.toMatchObject({ status: 403, message: 'Active local-admin required.' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('never retries a failed start or stop whose outcome may be uncertain', async () => {
    const fetcher = vi.fn(async () => { throw new Error('Connection lost') })
    const api = createPopulationApi(fetcher)
    await expect(api.start(populationTarget, populationRecipe)).rejects.toThrow('Connection lost')
    await expect(api.stop(populationTarget, 'synthetic-job')).rejects.toThrow('Connection lost')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
