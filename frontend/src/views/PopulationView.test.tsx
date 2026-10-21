import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createPopulationApi } from '../api/populationApi'
import { createProductApi } from '../api/productApi'
import type { AuthenticatedFetch } from '../api/types'
import { usePopulation } from '../hooks/usePopulation'
import { catalog, datasets, response } from '../test/fixtures'
import { populationJob, populationRecipe } from '../test/populationFixtures'
import { PopulationView } from './PopulationView'

const jobPath = '/api/suts/synthetic-a/datasets/cards/population/synthetic-job'
const defaultFetch: AuthenticatedFetch = async (input, options) => {
  const path = String(input)
  if (path.endsWith('/inventory')) return response([])
  if (path.endsWith('/stop')) return response({ ...populationJob, status: 'STOPPED', completed: 1, published: 1, inventoryId: 'saved-partial' })
  if (options?.method === 'POST') return response(populationJob)
  return response({ ...populationJob, status: 'SUCCEEDED', completed: 2, published: 2, inventoryId: 'saved-final' })
}

function show(canEdit = true, fetcher = vi.fn(defaultFetch)) {
  const api = createPopulationApi(fetcher)
  const productApi = createProductApi(fetcher)
  const refreshed = vi.fn()
  function Harness({ allowed }: { allowed: boolean }) {
    const [selected, select] = useState('cards')
    const [revision, setRevision] = useState(0)
    function refresh() { refreshed(); setRevision(value => value + 1) }
    const controller = usePopulation(api, allowed, refresh)
    return <MemoryRouter><PopulationView api={api} productApi={productApi} controller={controller} sut={catalog.suts[0]} datasets={datasets} selected={selected} onSelect={select}
      canEdit={allowed} refreshing={false} datasetError="" inventoryRevision={revision} refreshInventory={refresh} /></MemoryRouter>
  }
  const mounted = render(<Harness allowed={canEdit} />)
  return { fetcher, refreshed, rerenderPermission: (allowed: boolean) => mounted.rerender(<Harness allowed={allowed} />) }
}

function editRecipe() {
  fireEvent.change(screen.getByRole('textbox', { name: 'JSON script' }), { target: { value: JSON.stringify(populationRecipe) } })
}
async function run() {
  editRecipe()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target list' }), 'returned')
  await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm Run' }))
}

describe('scripted population view', () => {
  it('does not show scripts or request private inventory/job/CSV for viewers', () => {
    const { fetcher } = show(false)
    expect(screen.getByText('Population requires local-admin')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'JSON script' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run script…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download response CSV' })).not.toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires explicit confirmation with the exact SUT, DataSet, list and iteration count', async () => {
    const { fetcher } = show()
    editRecipe()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target list' }), 'returned')
    await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
    const dialog = screen.getByRole('dialog', { name: 'Run population script?' })
    expect(dialog).toHaveTextContent('synthetic-a')
    expect(dialog).toHaveTextContent('cards')
    expect(dialog).toHaveTextContent('returned')
    expect(dialog).toHaveTextContent('Iterations2')
    expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0)
  })
  it('explains the explicit portable call, independent params and safe JSON/XML authoring', async () => {
    show()
    await userEvent.click(screen.getByText('Template and SOAP contract'))
    const help = screen.getByText('Template and SOAP contract').closest('details')!
    expect(help).toHaveTextContent("profile: 'portable-v1'")
    expect(help).toHaveTextContent('params.iteration')
    expect(help).toHaveTextContent('PD overwrites reserved')
    expect(help).toHaveTextContent('Leading-zero IDs stay strings')
    expect(help).toHaveTextContent("json_path(record, '/field')")
    expect(help).toHaveTextContent('{{ json_string(record.customer) }}')
    expect(help).toHaveTextContent('without surrounding quotes')
    expect(help).toHaveTextContent('xml_path(source, xpath, namespaceMap)')
    expect(help).toHaveTextContent('xml_text(record.accountNumber)')
    expect(help).toHaveTextContent('xml_attr(record.accountNumber)')
    expect(help).toHaveTextContent('JSON responses require json_path; SOAP requires xml_path and its version capability')
    expect(help).toHaveTextContent('no automatic rewriting')
    expect(help).not.toHaveTextContent(/payload|endpointPath|\bvars\b|\bctx\b/)
  })
  it('posts default JSON with quoted/control-character data and independent string params unchanged', async () => {
    const { fetcher } = show()
    const editor = screen.getByRole('textbox', { name: 'JSON script' }) as HTMLTextAreaElement
    const recipe = JSON.parse(editor.value)
    expect(recipe.steps[0].call).toMatchObject({
      profile: 'portable-v1', requires: ['json_path', 'json_string'],
      request: { bodyTemplate: '{"customer":{{ json_string(record.customer) }},"sequence":{{ params.iteration }}}' },
      response: { kind: 'JSON', soapAction: '' },
    })
    recipe.values = { customer: '000"customer\\\n\t\u0000","admin":true', extra: '000007' }
    recipe.params = { customer: '009', iteration: '999' }
    fireEvent.change(editor, { target: { value: JSON.stringify(recipe) } })
    await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
    expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Run' }))
    const posts = fetcher.mock.calls.filter(call => call[1]?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0][1]?.body).toBe(JSON.stringify(recipe))
    const posted = JSON.parse(String(posts[0][1]?.body))
    expect(posted.values.customer).toBe(recipe.values.customer)
    expect(posted.values.extra).toBe('000007')
    expect(posted.params).toEqual({ customer: '009', iteration: '999' })
  })
  it('posts exact SOAP/namespace/template values once and locks editing while start is pending', async () => {
    let finish: (value: Response) => void = () => { throw new Error('Not started') }
    const fetcher = vi.fn<AuthenticatedFetch>(async (input, options) => options?.method === 'POST' ? new Promise(resolve => { finish = resolve }) : defaultFetch(input, options))
    show(true, fetcher)
    editRecipe()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target list' }), 'returned')
    await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
    const button = screen.getByRole('button', { name: 'Confirm Run' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'JSON script' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'DataSet' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Target list' })).toBeDisabled()
    finish(response(populationJob))
    expect(await screen.findByRole('region', { name: 'Population job' })).toHaveTextContent('RUNNING')
    expect(screen.getByRole('button', { name: 'Download response CSV' })).toBeDisabled()
    const post = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/suts/synthetic-a/datasets/cards/population?list=returned')
    expect(JSON.parse(String(post[1]?.body))).toEqual(populationRecipe)
    expect(localStorage.length).toBe(0)
  })
  it('loads a JSON file as data only and does not execute it until confirmed', async () => {
    const { fetcher } = show()
    const file = new File([JSON.stringify(populationRecipe)], 'script.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(populationRecipe) })
    await userEvent.upload(screen.getByLabelText(/Load JSON script/), file)
    expect(screen.getByRole('textbox', { name: 'JSON script' })).toHaveValue(JSON.stringify(populationRecipe))
    expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Synthetic SOAP only')
  })
  it.each(['{not json', '[]', 'null', '{"name":"bad", "count":1001}'])('rejects an invalid JSON/count input without a request: %s', async script => {
    const { fetcher } = show()
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON script' }), { target: { value: script } })
    await userEvent.click(screen.getByRole('button', { name: 'Run script…' }))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0)
  })
  it('rejects oversized files without reading or replacing the previous script', async () => {
    show()
    const file = new File(['{}'], 'large.json', { type: 'application/json' })
    const read = vi.fn()
    Object.defineProperties(file, { size: { value: 1024 * 1024 + 1 }, text: { value: read } })
    await userEvent.upload(screen.getByLabelText(/Load JSON script/), file)
    expect(screen.getByRole('alert')).toHaveTextContent('1 MiB')
    expect(read).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Run script…' })).toBeDisabled()
  })
  it('shows a failed start explicitly, without a fabricated job or automatic retry', async () => {
    const fetcher = vi.fn<AuthenticatedFetch>(async (input, options) => options?.method === 'POST' ? response({ error: 'Unknown endpoint: api' }, 400) : defaultFetch(input, options))
    show(true, fetcher)
    await run()
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown endpoint: api')
    expect(screen.getByRole('alert')).toHaveTextContent('No automatic retry')
    expect(screen.queryByRole('region', { name: 'Population job' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1)
  })
  it('stops once, displays the server counters and refreshes durable inventory', async () => {
    const { fetcher, refreshed } = show()
    await run()
    const stop = await screen.findByRole('button', { name: 'Stop' })
    fireEvent.click(stop)
    fireEvent.click(stop)
    const job = await screen.findByRole('region', { name: 'Population job' })
    await waitFor(() => expect(job).toHaveTextContent('STOPPED'))
    expect(job).toHaveTextContent('saved-partial')
    expect(job).toHaveTextContent('Published1')
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith('/stop'))).toHaveLength(1)
    expect(refreshed).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith('/inventory'))).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh inventory' })).toBeEnabled())
    const previous = fetcher.mock.calls.filter(call => String(call[0]).endsWith('/inventory')).length
    await userEvent.click(screen.getByRole('button', { name: 'Refresh inventory' }))
    await waitFor(() => expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith('/inventory'))).toHaveLength(previous + 1))
  })
  it('downloads response audit only via authenticated API with no credential link', async () => {
    const fetcher = vi.fn<AuthenticatedFetch>(async (input, options) => String(input).endsWith('/responses') ? new Response('iteration,status\n1,200\n', { headers: { 'Content-Type': 'text/csv' } }) : defaultFetch(input, options))
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:audit'); static revokeObjectURL = vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    show(true, fetcher)
    await run()
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download response CSV' })).toBeEnabled())
    await userEvent.click(await screen.findByRole('button', { name: 'Download response CSV' }))
    expect(fetcher).toHaveBeenCalledWith(`${jobPath}/responses`, { cache: 'no-store' })
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: /responses/ })).not.toBeInTheDocument()
  })
  it('shows a protected response-CSV failure without opening a link or retrying', async () => {
    const fetcher = vi.fn<AuthenticatedFetch>(async (input, options) => String(input).endsWith('/responses') ? response({ error: 'Active local-admin required.' }, 403) : defaultFetch(input, options))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    show(true, fetcher)
    await run()
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download response CSV' })).toBeEnabled())
    await userEvent.click(await screen.findByRole('button', { name: 'Download response CSV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Active local-admin required')
    expect(screen.getByRole('alert')).toHaveTextContent('No automatic retry')
    expect(click).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith('/responses'))).toHaveLength(1)
  })
  it('hides privileged job details/controls when the shared session loses edit permission', async () => {
    const { rerenderPermission } = show()
    await run()
    await screen.findByRole('region', { name: 'Population job' })
    rerenderPermission(false)
    expect(screen.queryByRole('region', { name: 'Population job' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download response CSV' })).not.toBeInTheDocument()
  })
  it('renders SOAP fault/partial results from the server without claiming success', async () => {
    const fetcher = vi.fn<AuthenticatedFetch>(async (input, options) => options?.method === 'POST' ? response({ ...populationJob, status: 'FAILED', completed: 1, published: 1, inventoryId: 'partial', error: 'SOAP Fault: synthetic rejection' }) : defaultFetch(input, options))
    show(true, fetcher)
    await run()
    expect(await screen.findByRole('region', { name: 'Population job' })).toHaveTextContent('FAILED')
    expect(screen.getByRole('alert')).toHaveTextContent('SOAP Fault: synthetic rejection')
    expect(screen.getByRole('alert')).toHaveTextContent('No automatic retry or resume')
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })
})
