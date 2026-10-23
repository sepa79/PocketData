import { describe, expect, it } from 'vitest'
import { describePacing, formatAchievedRate, formatDuration, pacingError } from './populationPacing'

describe('population pacing presentation', () => {
  it.each([
    [0, '0/s'], [12.3456, '12.3/s'], [1 / 30, '2/min'], [3 / 3600, '3/h'], [2 / 86400, '2/day'], [0.1 / 86400, '0.1/day'],
  ])('auto-scales achieved rate %s to %s', (value, label) => {
    expect(formatAchievedRate(value)).toBe(label)
  })
  it.each([[0, '0 ms'], [25, '25 ms'], [3000, '3 s'], [1200000, '20 min'], [7200000, '2 h'], [86400000, '1 day'], [172800000, '2 days']])('formats duration %s as %s', (value, label) => {
    expect(formatDuration(value)).toBe(label)
  })
  it('normalizes a run rate without changing the exact confirmation units', () => {
    const pacing = { mode: 'RATE', value: 180, unit: 'HOURS' } as const
    expect(describePacing(pacing)).toBe('Attempted rate (best effort): 180 per hour')
    expect(describePacing(pacing, true)).toBe('Attempted rate (best effort): 3/min')
  })
  it.each([
    { mode: 'DELAY', value: 0, unit: 'MILLISECONDS' },
    { mode: 'DELAY', value: 1.5, unit: 'MILLISECONDS' },
    { mode: 'DELAY', value: 0.001, unit: 'SECONDS' },
    { mode: 'DELAY', value: 365, unit: 'DAYS' },
    { mode: 'RATE', value: 1e9, unit: 'SECONDS' },
    { mode: 'RATE', value: 1 / 365, unit: 'DAYS' },
  ] as const)('accepts server interval boundary %j without rewriting', pacing => {
    expect(pacingError(pacing)).toBe('')
  })
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects nonfinite value %s', value => {
    expect(pacingError({ mode: 'DELAY', value, unit: 'SECONDS' })).toContain('finite')
  })
})
