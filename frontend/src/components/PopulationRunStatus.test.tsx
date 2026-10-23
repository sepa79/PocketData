import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PopulationJob } from '../api/populationTypes'
import { populationJob, populationTarget } from '../test/populationFixtures'
import { PopulationRunStatus } from './PopulationRunStatus'

function show(job: PopulationJob) {
  const api = { draft: vi.fn(), start: vi.fn(), status: vi.fn(), stop: vi.fn(), responses: vi.fn() }
  const controller = { run: { target: populationTarget, job }, pending: false, active: job.status === 'RUNNING', pollError: '', error: '', start: vi.fn(), stop: vi.fn(), resumeStatus: vi.fn() }
  return render(<PopulationRunStatus api={api} controller={controller} />)
}

describe('population pacing status', () => {
  it('shows reported achieved throughput, normalized target rate and human-readable waiting time', () => {
    show({ ...populationJob, published: 999, elapsedMs: 1_200_000, achievedPerSecond: 3 / 3600, pacing: { mode: 'RATE', value: 180, unit: 'HOURS' }, waiting: true, waitRemainingMs: 172_800_000 })
    const region = screen.getByRole('region', { name: 'Population job' })
    expect(region).toHaveTextContent('Achieved rate3/h')
    expect(region).toHaveTextContent('Elapsed20 min')
    expect(region).toHaveTextContent('Attempted rate (best effort): 3/min')
    expect(region).toHaveTextContent('published full iterations over elapsed time')
    expect(screen.getByRole('status')).toHaveTextContent('Waiting between iterations · 2 days remaining (last reported)')
    expect(screen.getByText('2 days')).toHaveAttribute('title', '172800000 ms')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
  })
  it('shows a terminal snapshot without a waiting message or recalculating the server rate', () => {
    show({ ...populationJob, status: 'SUCCEEDED', completed: 2, published: 2, elapsedMs: 3000, achievedPerSecond: 0.5, waiting: false, waitRemainingMs: 0 })
    expect(screen.getByRole('region', { name: 'Population job' })).toHaveTextContent('Achieved rate30/min')
    expect(screen.getByRole('region', { name: 'Population job' })).toHaveTextContent('Elapsed3 s')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })
  it('renders zero achieved rate at startup', () => {
    show(populationJob)
    expect(screen.getByRole('region', { name: 'Population job' })).toHaveTextContent('Achieved rate0/s')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
