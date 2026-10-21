import { useCallback, useEffect, useRef, useState } from 'react'
import type { PopulationApi } from '../api/populationApi'
import type { PopulationJob, PopulationRecipe, PopulationTarget } from '../api/populationTypes'

export function populationActive(job: PopulationJob) {
  return job.status === 'RUNNING' || job.status === 'STOPPING'
}

export function usePopulation(api: PopulationApi, canEdit: boolean, onFinished: () => void) {
  const [run, setRun] = useState<{ target: PopulationTarget; job: PopulationJob } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [pollRevision, setPollRevision] = useState(0)
  const submitting = useRef(false)
  const currentRun = useRef<typeof run>(null)
  const operationRevision = useRef(0)
  const finished = useRef(new Set<string>())
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished
  const active = Boolean(run && populationActive(run.job))

  const accept = useCallback((target: PopulationTarget, job: PopulationJob) => {
    const snapshot = { target, job }
    currentRun.current = snapshot
    setRun(snapshot)
  }, [])

  useEffect(() => {
    if (!run || populationActive(run.job) || finished.current.has(run.job.id)) return
    finished.current.add(run.job.id)
    onFinishedRef.current()
  }, [run])

  useEffect(() => {
    if (!run || !active || !canEdit || pending || pollError) return
    const abort = new AbortController()
    const revision = operationRevision.current
    const timer = setTimeout(() => {
      api.status(run.target, run.job.id, abort.signal).then(job => {
        if (!abort.signal.aborted && revision === operationRevision.current) accept(run.target, job)
      }).catch(failure => {
        if (!abort.signal.aborted && revision === operationRevision.current) setPollError(`${failure instanceof Error ? failure.message : 'Status unavailable.'} Status checks paused; the job may still be running. No automatic retry.`)
      })
    }, 1000)
    return () => { clearTimeout(timer); abort.abort() }
  }, [api, run, active, canEdit, pending, pollError, pollRevision, accept])

  const start = useCallback(async (target: PopulationTarget, recipe: PopulationRecipe) => {
    if (!canEdit || submitting.current || currentRun.current && populationActive(currentRun.current.job)) return
    submitting.current = true
    operationRevision.current += 1
    setPending(true)
    setError('')
    setPollError('')
    setRun(null)
    currentRun.current = null
    try {
      const job = await api.start(target, recipe)
      accept(target, job)
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Start failed.'} Start not confirmed. No automatic retry. Check inventory and the server before another Run if the outcome is uncertain.`)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }, [api, canEdit, accept])

  const stop = useCallback(async () => {
    if (!canEdit || submitting.current || !run || run.job.status !== 'RUNNING') return
    submitting.current = true
    operationRevision.current += 1
    setPending(true)
    setError('')
    try {
      const job = await api.stop(run.target, run.job.id)
      accept(run.target, job)
      setPollError('')
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Stop failed.'} Stop not confirmed. No automatic retry; the job may still be running.`)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }, [api, canEdit, run, accept])

  function resumeStatus() {
    if (!canEdit || pending) return
    setPollError('')
    setPollRevision(value => value + 1)
  }

  return { run, pending, active, error, pollError, start, stop, resumeStatus }
}

export type PopulationController = ReturnType<typeof usePopulation>
