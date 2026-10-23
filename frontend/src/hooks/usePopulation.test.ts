import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PopulationApi } from '../api/populationApi'
import type { PopulationJob } from '../api/populationTypes'
import { populationJob, populationRecipe, populationTarget } from '../test/populationFixtures'
import { usePopulation } from './usePopulation'

function apiFixture() {
  return {
    draft: vi.fn(async () => ({ revision: 0, list: '', recipe: null })),
    start: vi.fn(async () => populationJob), status: vi.fn(async () => populationJob),
    stop: vi.fn(async (): Promise<PopulationJob> => ({ ...populationJob, status: 'STOPPED' })), responses: vi.fn(async () => new Blob()),
  } satisfies PopulationApi
}

afterEach(() => vi.useRealTimers())

describe('population job owner', () => {
  it('denies start and protected status access to a viewer', async () => {
    const api = apiFixture()
    const { result } = renderHook(() => usePopulation(api, false, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    expect(api.start).not.toHaveBeenCalled()
    expect(api.status).not.toHaveBeenCalled()
    expect(result.current.run).toBeNull()
  })
  it('locks duplicate starts synchronously, before a render or server response', async () => {
    let finish: (job: PopulationJob) => void = () => { throw new Error('Not started') }
    const api = apiFixture()
    api.start.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => usePopulation(api, true, vi.fn()))
    let first!: Promise<void>
    act(() => { first = result.current.start(populationTarget, populationRecipe); void result.current.start(populationTarget, populationRecipe) })
    expect(api.start).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => { finish(populationJob); await first })
    await act(() => result.current.start(populationTarget, populationRecipe))
    expect(api.start).toHaveBeenCalledTimes(1)
    expect(result.current.run?.job).toEqual(populationJob)
  })
  it('polls serially once per second while active and refreshes inventory once at terminal status', async () => {
    vi.useFakeTimers()
    const api = apiFixture()
    const finished = vi.fn()
    api.status.mockResolvedValueOnce(populationJob).mockResolvedValueOnce({ ...populationJob, status: 'SUCCEEDED', completed: 2, published: 2, inventoryId: 'saved-1' })
    const { result } = renderHook(() => usePopulation(api, true, finished))
    await act(() => result.current.start(populationTarget, populationRecipe))
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(api.status).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(api.status).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(api.status).toHaveBeenCalledTimes(2)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(result.current.run?.job.inventoryId).toBe('saved-1')
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(api.status).toHaveBeenCalledTimes(2)
  })
  it('pauses polling on an error without inventing FAILED or automatically retrying', async () => {
    vi.useFakeTimers()
    const api = apiFixture()
    api.status.mockRejectedValueOnce(new Error('Network down'))
    const { result } = renderHook(() => usePopulation(api, true, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(result.current.pollError).toContain('No automatic retry')
    expect(result.current.run?.job.status).toBe('RUNNING')
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(api.status).toHaveBeenCalledTimes(1)
    act(() => result.current.resumeStatus())
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(api.status).toHaveBeenCalledTimes(2)
  })
  it('does not overlap slow status requests or poll after unmount', async () => {
    vi.useFakeTimers()
    let finish: (job: PopulationJob) => void = () => { throw new Error('Not polling') }
    const api = apiFixture()
    api.status.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { result, unmount } = renderHook(() => usePopulation(api, true, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    await act(() => vi.advanceTimersByTimeAsync(8000))
    expect(api.status).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => finish(populationJob))
    await act(() => vi.advanceTimersByTimeAsync(8000))
    expect(api.status).toHaveBeenCalledTimes(1)
  })
  it('keeps the last observed job when Stop fails rather than claiming STOPPED', async () => {
    const api = apiFixture()
    api.stop.mockRejectedValueOnce(new Error('Stop timeout'))
    const { result } = renderHook(() => usePopulation(api, true, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    await act(() => result.current.stop())
    expect(result.current.run?.job.status).toBe('RUNNING')
    expect(result.current.error).toContain('Stop not confirmed')
    expect(api.stop).toHaveBeenCalledTimes(1)
  })
  it('records only the server stop response and aborts any stale poll', async () => {
    vi.useFakeTimers()
    let finish: (job: PopulationJob) => void = () => { throw new Error('Not polling') }
    const api = apiFixture()
    api.status.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => usePopulation(api, true, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    const signal = (api.status.mock.calls[0] as unknown as [unknown, unknown, AbortSignal])[2]
    await act(async () => { const stop = result.current.stop(); void result.current.stop(); await stop })
    expect(api.stop).toHaveBeenCalledExactlyOnceWith(populationTarget, populationJob.id)
    expect(signal.aborted).toBe(true)
    await act(async () => finish(populationJob))
    expect(result.current.run?.job.status).toBe('STOPPED')
  })
  it('stops protected polling while edit permission is lost and aborts on unmount', async () => {
    vi.useFakeTimers()
    const api = apiFixture()
    const { result, rerender, unmount } = renderHook(({ allowed }) => usePopulation(api, allowed, vi.fn()), { initialProps: { allowed: true } })
    await act(() => result.current.start(populationTarget, populationRecipe))
    rerender({ allowed: false })
    await act(() => vi.advanceTimersByTimeAsync(4000))
    expect(api.status).not.toHaveBeenCalled()
    await act(() => result.current.stop())
    expect(api.stop).not.toHaveBeenCalled()
    rerender({ allowed: true })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(api.status).toHaveBeenCalledTimes(1)
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(4000))
    expect(api.status).toHaveBeenCalledTimes(1)
  })
  it('does not invent a job ID, status or inventory after an uncertain start failure', async () => {
    const api = apiFixture()
    api.start.mockRejectedValueOnce(new Error('Connection lost'))
    const { result } = renderHook(() => usePopulation(api, true, vi.fn()))
    await act(() => result.current.start(populationTarget, populationRecipe))
    expect(result.current.run).toBeNull()
    expect(result.current.error).toContain('Start not confirmed')
    expect(result.current.error).toContain('No automatic retry')
    expect(result.current.pending).toBe(false)
    expect(api.start).toHaveBeenCalledTimes(1)
  })
})
