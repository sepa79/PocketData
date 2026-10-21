import { useRef, useState } from 'react'
import type { PopulationApi } from '../api/populationApi'
import type { PopulationController } from '../hooks/usePopulation'

export function PopulationRunStatus({ api, controller }: {
  api: PopulationApi; controller: PopulationController
}) {
  const { run, pending, active, pollError } = controller
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const downloadLock = useRef(false)

  async function downloadResponses() {
    if (!run || active || pending || downloadLock.current) return
    downloadLock.current = true
    setDownloading(true)
    setDownloadError('')
    try {
      const blob = await api.responses(run.target, run.job.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${run.target.dataset}-${run.job.id}-responses.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setDownloadError(`${failure instanceof Error ? failure.message : 'Response CSV download failed.'} No automatic retry.`)
    } finally {
      downloadLock.current = false
      setDownloading(false)
    }
  }

  if (!run) return null
  const { job, target } = run
  return <section className="pd-card" aria-label="Population job">
    <div className="pd-card-heading"><h2>{job.status}</h2><code>{job.id}</code></div>
    <p className="pd-muted">{target.sut} / {target.dataset} / {target.list}{pollError ? ' · Last confirmed status' : ''}</p>
    <dl className="pd-population-counters">
      <div><dt>Requested</dt><dd>{job.total}</dd></div><div><dt>Completed</dt><dd>{job.completed}</dd></div>
      <div><dt>Published</dt><dd>{job.published}</dd></div><div><dt>Iteration</dt><dd>{job.iteration}</dd></div>
    </dl>
    {job.step ? <p className="pd-muted">Step: {job.step}</p> : null}
    {job.inventoryId ? <p>Saved inventory: <code>{job.inventoryId}</code></p> : null}
    {job.error ? <p className="pd-error" role="alert">{job.error} No automatic retry or resume. Inspect inventory and Redis before running again.</p> : null}
    {pollError ? <p className="pd-error" role="alert">{pollError}</p> : null}
    {downloadError ? <p className="pd-error" role="alert">{downloadError}</p> : null}
    <div className="pd-actions">
      {job.status === 'RUNNING' ? <button disabled={pending} onClick={() => void controller.stop()}>{pending ? 'Requesting stop…' : 'Stop'}</button> : null}
      {job.status === 'STOPPING' ? <span role="status" className="pd-muted">Stopping after the current request. Completed work is not rolled back.</span> : null}
      {pollError ? <button disabled={pending} onClick={controller.resumeStatus}>Resume status checks</button> : null}
      <button disabled={active || pending || downloading} onClick={() => void downloadResponses()}>{downloading ? 'Downloading…' : 'Download response CSV'}</button>
    </div>
    <p className="pd-muted">CSV downloads are available after the job finishes. Responses are audited before extraction or the next request. Published counts are acknowledged records, not a promise of exactly-once publication.</p>
  </section>
}
