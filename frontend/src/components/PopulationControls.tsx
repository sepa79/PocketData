import type { PopulationPacing, PopulationPacingUnit, PopulationRecipe } from '../api/populationTypes'
import { pacingUnits } from './populationPacing'
import { FieldHelp } from './FieldHelp'

export function PopulationControls({ recipe, locked, onChange }: {
  recipe: PopulationRecipe | null; locked: boolean; onChange: (recipe: PopulationRecipe) => void
}) {
  function updatePacing(change: Partial<PopulationPacing>) {
    if (recipe && !locked) onChange({ ...recipe, pacing: { ...recipe.pacing, ...change } })
  }

  return <fieldset className="pd-population-controls" disabled={locked || !recipe}>
    <legend>Iterations and pacing</legend>
    <div className="pd-form-grid">
      <FieldHelp label="Iterations" hint="Full script repetitions, from 1 to 1000." details="Each iteration runs every script step and publishes one completed record. Editing this field updates count in the JSON recipe.">{description => <input aria-label="Iterations" aria-describedby={description} type="number" min={1} max={1000} step={1} value={Number.isFinite(recipe?.count) ? recipe!.count : ''}
        onChange={event => { if (recipe && !locked) onChange({ ...recipe, count: event.target.valueAsNumber }) }} />}</FieldHelp>
      <FieldHelp label="Pacing mode" hint="Choose a delay or a best-effort rate." details="Delay waits after a full iteration. Attempted rate spaces iterations using a single executor, with no catch-up bursts. Switching from a millisecond delay to rate selects seconds; review the value before running.">{description => <select aria-label="Pacing mode" aria-describedby={description} value={recipe?.pacing.mode ?? ''} onChange={event => {
        const mode = event.target.value as PopulationPacing['mode']
        updatePacing({ mode, ...(mode === 'RATE' && recipe?.pacing.unit === 'MILLISECONDS' ? { unit: 'SECONDS' } : {}) })
      }}>
        {!recipe ? <option value="">Fix the script first</option> : null}
        <option value="DELAY">Delay after full iteration</option>
        <option value="RATE">Attempted rate (best effort)</option>
      </select>}</FieldHelp>
      <FieldHelp label="Pacing value" hint={recipe?.pacing.mode === 'RATE' ? 'Positive attempted iterations per selected unit.' : 'Zero means as fast as possible.'} details="Delay must be zero or at least 1 millisecond. Attempted rate must be positive and allow at least 1 nanosecond per iteration. The derived interval cannot exceed 365 days.">{description => <input aria-label="Pacing value" aria-describedby={description} type="number" min={0} step="any" value={Number.isFinite(recipe?.pacing.value) ? recipe!.pacing.value : ''}
        onChange={event => updatePacing({ value: event.target.valueAsNumber })} />}</FieldHelp>
      <FieldHelp label="Pacing unit" hint={recipe?.pacing.mode === 'RATE' ? 'Per second, minute, hour or day.' : 'Milliseconds through days.'} details="The value and selected unit are stored exactly in recipe.pacing. Rate cannot use milliseconds. Imported recipes retain their own mode, value and unit.">{description => <select aria-label="Pacing unit" aria-describedby={description} value={recipe?.pacing.unit ?? ''} onChange={event => updatePacing({ unit: event.target.value as PopulationPacingUnit })}>
        {!recipe ? <option value="">Fix the script first</option> : null}
        {pacingUnits.filter(unit => recipe?.pacing.mode !== 'RATE' || unit.value !== 'MILLISECONDS').map(unit => <option key={unit.value} value={unit.value}>{recipe?.pacing.mode === 'RATE' ? `per ${unit.label.slice(0, -1)}` : unit.label}</option>)}
        {recipe?.pacing.mode === 'RATE' && recipe.pacing.unit === 'MILLISECONDS' ? <option value="MILLISECONDS" disabled>milliseconds (invalid for rate)</option> : null}
      </select>}</FieldHelp>
    </div>
    <p className="pd-muted">{recipe?.pacing.mode === 'RATE' ? 'Best effort with a single executor. Slow iterations lower the achieved rate; no catch-up bursts.' : 'Delay follows each full iteration. Zero runs as fast as possible. Nonzero delays must be at least 1 millisecond.'} Maximum interval: 365 days.</p>
  </fieldset>
}
