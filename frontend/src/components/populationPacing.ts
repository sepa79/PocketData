import type { PopulationPacing, PopulationPacingUnit } from '../api/populationTypes'

export const pacingUnits: { value: PopulationPacingUnit; label: string; milliseconds: number }[] = [
  { value: 'MILLISECONDS', label: 'milliseconds', milliseconds: 1 },
  { value: 'SECONDS', label: 'seconds', milliseconds: 1000 },
  { value: 'MINUTES', label: 'minutes', milliseconds: 60_000 },
  { value: 'HOURS', label: 'hours', milliseconds: 3_600_000 },
  { value: 'DAYS', label: 'days', milliseconds: 86_400_000 },
]

export function pacingError(pacing: PopulationPacing): string {
  const unit = pacingUnits.find(item => item.value === pacing.unit)
  if (!unit || !['DELAY', 'RATE'].includes(pacing.mode)) return 'Pacing requires mode DELAY or RATE and an explicit supported unit.'
  if (typeof pacing.value !== 'number' || !Number.isFinite(pacing.value)) return 'Enter a finite pacing value.'
  if (pacing.mode === 'RATE' && pacing.unit === 'MILLISECONDS') return 'Attempted rate cannot use milliseconds.'
  if (pacing.mode === 'RATE' ? pacing.value <= 0 : pacing.value < 0) return pacing.mode === 'RATE' ? 'Attempted rate must be positive.' : 'Delay must be zero or greater.'
  const interval = pacing.mode === 'RATE' ? unit.milliseconds / pacing.value : unit.milliseconds * pacing.value
  if (interval > 365 * 86_400_000) return 'The pacing interval must not exceed 365 days.'
  if (pacing.mode === 'RATE' && interval < 0.000001) return 'Attempted rate must allow at least 1 nanosecond between iterations.'
  if (pacing.mode === 'DELAY' && pacing.value !== 0 && interval < 1) return 'Nonzero delay must be at least 1 millisecond.'
  return ''
}

export function describePacing(pacing: PopulationPacing, autoScaleRate = false): string {
  const unit = pacing.unit.toLowerCase()
  return pacing.mode === 'DELAY'
    ? `Delay after full iteration: ${pacing.value} ${unit}${pacing.value === 0 ? ' (as fast as possible)' : ''}`
    : `Attempted rate (best effort): ${autoScaleRate ? formatAchievedRate(pacing.value * 1000 / pacingUnits.find(item => item.value === pacing.unit)!.milliseconds) : `${pacing.value} per ${unit.slice(0, -1)}`}`
}

export function formatAchievedRate(perSecond: number): string {
  const units = [{ seconds: 1, label: 's' }, { seconds: 60, label: 'min' }, { seconds: 3600, label: 'h' }, { seconds: 86400, label: 'day' }]
  const unit = perSecond === 0 ? units[0] : units.find(item => perSecond * item.seconds >= 1) ?? units[3]
  return `${Number((perSecond * unit.seconds).toPrecision(3))}/${unit.label}`
}

export function formatDuration(milliseconds: number): string {
  const units = [{ milliseconds: 86_400_000, label: 'days' }, { milliseconds: 3_600_000, label: 'h' }, { milliseconds: 60_000, label: 'min' }, { milliseconds: 1000, label: 's' }, { milliseconds: 1, label: 'ms' }]
  const unit = units.find(item => milliseconds >= item.milliseconds) ?? units[4]
  const value = Number((milliseconds / unit.milliseconds).toPrecision(3))
  return `${value} ${unit.label === 'days' && value === 1 ? 'day' : unit.label}`
}
