import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createProductApi } from '../api/productApi'
import type { AuthenticatedFetch } from '../api/types'
import { datasets, response } from '../test/fixtures'
import { InventoryView } from './InventoryView'

describe('CSV inventory view', () => {
  function show(canEdit: boolean, fetcher: AuthenticatedFetch = vi.fn(async () => response([]))) {
    const onBusyChange = vi.fn()
    const onImported = vi.fn()
    render(<InventoryView api={createProductApi(fetcher)} sut="synthetic-a" datasets={datasets} selected="cards" onSelect={vi.fn()} canEdit={canEdit} refreshing={false} datasetError="" revision={0} onBusyChange={onBusyChange} onImported={onImported} notify={vi.fn()} />)
    return { fetcher, onBusyChange, onImported }
  }
  it('does not request raw inventory or expose upload controls for viewers', () => {
    const { fetcher } = show(false)
    expect(screen.getByText('Raw inventory requires local-admin')).toBeVisible()
    expect(screen.queryByLabelText(/CSV file/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('publishes the selected file exactly once and refreshes only after success', async () => {
    let finish: (response: Response) => void = () => { throw new Error('Import not started') }
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit): Promise<Response> => options?.method === 'POST' ? new Promise(resolve => { finish = resolve }) : response([]))
    const { onBusyChange, onImported } = show(true, fetcher)
    const file = new File(['accountNumber,extra\n0001,retained\n'], 'synthetic.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText(/CSV file/, { selector: 'input' }), file)
    await userEvent.selectOptions(screen.getByLabelText('Target list'), 'returned')
    await userEvent.click(screen.getByRole('button', { name: 'Import to Redis' }))
    expect(screen.getByRole('button', { name: 'Saving and publishing…' })).toBeDisabled()
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
    expect(onImported).not.toHaveBeenCalled()
    finish(response({ id: 'synthetic-import', published: 1 }))
    expect(await screen.findByText('Saved CSV synthetic-import. Published 1 records.')).toBeVisible()
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    expect(onImported).toHaveBeenCalledTimes(1)
    const posts = fetcher.mock.calls.filter(call => call[1]?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(['/api/suts/synthetic-a/datasets/cards/import?list=returned', expect.objectContaining({ body: file })])
  })
  it('shows uncertain publication without automatic retries or claiming success', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => options?.method === 'POST' ? response({ error: 'Saved inventory test-id; Redis publication uncertain.' }, 503) : response([]))
    const { onImported } = show(true, fetcher)
    await userEvent.upload(screen.getByLabelText(/CSV file/, { selector: 'input' }), new File(['a\n1'], 'synthetic.csv', { type: 'text/csv' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import to Redis' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No automatic retry')
    expect(screen.getByRole('alert')).toHaveTextContent('test-id')
    expect(onImported).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1)
  })
  it('rejects files above the size limit before upload', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => response([]))
    show(true, fetcher)
    const file = new File(['test'], 'synthetic.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText(/CSV file/, { selector: 'input' }), { target: { files: [file] } })
    await userEvent.click(screen.getByRole('button', { name: 'Import to Redis' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('25 MiB')
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(0)
  })
  it('downloads CSV through authenticated fetch instead of placing credentials in a link', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => String(input).endsWith('/inventory') ? response([{ id, bytes: 50 }]) : new Response('accountNumber\n001\n', { headers: { 'Content-Type': 'text/csv' } }))
    const createUrl = vi.fn(() => 'blob:synthetic')
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    show(true, fetcher)
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenCalledWith(`/api/suts/synthetic-a/datasets/cards/inventory/${id}`, expect.objectContaining({ cache: 'no-store' }))
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'text/csv', size: 18 }))
  })
})
