import type { PopulationRecipe } from '../api/populationTypes'
import { pacingError, pacingUnits } from '../components/populationPacing'

export const scriptLimit = 1024 * 1024

export function readPopulationScript(script: string): { recipe: PopulationRecipe | null; error: string } {
  try {
    if (script.length > scriptLimit) throw new Error('JSON script limit is 1 MiB.')
    const recipe = JSON.parse(script) as PopulationRecipe
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('The script must be a JSON object, not JavaScript or Groovy.')
    if (typeof recipe.name !== 'string' || !recipe.name.trim()) throw new Error('The script needs a name.')
    if (!recipe.pacing || typeof recipe.pacing !== 'object' || Array.isArray(recipe.pacing)) throw new Error('The script requires pacing with mode, value and unit. Set it in Advanced / Script or import a complete recipe.')
    if (!['DELAY', 'RATE'].includes(recipe.pacing.mode) || !pacingUnits.some(unit => unit.value === recipe.pacing.unit)) throw new Error('Pacing requires mode DELAY or RATE and an explicit supported unit.')
    if (!Array.isArray(recipe.steps) || !recipe.steps.length || recipe.steps.some(step => !step || typeof step.name !== 'string' || typeof step.endpoint !== 'string')) throw new Error('The script needs named steps with SUT endpoints.')
    const error = !Number.isInteger(recipe.count) || recipe.count < 1 || recipe.count > 1000 ? 'Set count to 1–1000 iterations.' : pacingError(recipe.pacing)
    return { recipe, error }
  } catch (failure) {
    return { recipe: null, error: `Invalid script: ${failure instanceof Error ? failure.message : 'Invalid JSON.'}` }
  }
}
