import { requireSuccess } from './productApi'
import type { AuthenticatedFetch } from './types'
import type { PopulationJob, PopulationRecipe, PopulationTarget } from './populationTypes'

export function createPopulationApi(fetchWithAuth: AuthenticatedFetch) {
  const base = (target: PopulationTarget) => `/api/suts/${encodeURIComponent(target.sut)}/datasets/${encodeURIComponent(target.dataset)}/population`
  const jobPath = (target: PopulationTarget, id: string) => `${base(target)}/${encodeURIComponent(id)}`
  async function json(path: string, options: RequestInit): Promise<PopulationJob> {
    const response = await requireSuccess(await fetchWithAuth(path, { ...options, cache: 'no-store' }))
    return response.json() as Promise<PopulationJob>
  }
  return {
    draft: async (target: PopulationTarget) => {
      const response = await requireSuccess(await fetchWithAuth(`/api/suts/${encodeURIComponent(target.sut)}/datasets/${encodeURIComponent(target.dataset)}/population-draft`, { cache: 'no-store' }))
      return response.json() as Promise<{ revision: number; list: string; recipe: PopulationRecipe | null }>
    },
    start: (target: PopulationTarget, recipe: PopulationRecipe) => json(`${base(target)}?list=${encodeURIComponent(target.list)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe),
    }),
    status: (target: PopulationTarget, id: string, signal?: AbortSignal) => json(jobPath(target, id), { signal }),
    stop: (target: PopulationTarget, id: string) => json(`${jobPath(target, id)}/stop`, { method: 'POST' }),
    responses: async (target: PopulationTarget, id: string) => {
      const response = await requireSuccess(await fetchWithAuth(`${jobPath(target, id)}/responses`, { cache: 'no-store' }))
      return response.blob()
    },
  }
}

export type PopulationApi = ReturnType<typeof createPopulationApi>
