import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createProductApi } from '../api/productApi'
import { catalog, response } from '../test/fixtures'
import { DatasetEditor } from './DatasetEditor'
import { SutEditor } from './SutEditor'

describe('SUT editor', () => {
  it('adds a SUT without overwriting existing catalogue entries', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => response({ ...catalog, revision: 8 }))
    const saved = vi.fn()
    render(<SutEditor api={createProductApi(fetcher)} catalog={catalog} original={null} onClose={vi.fn()} onSaved={saved} />)
    await userEvent.type(screen.getByLabelText('ID'), 'synthetic-c')
    await userEvent.type(screen.getByLabelText('Name'), 'Synthetic C')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith('synthetic-c'))
    const sent = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(sent).toEqual({ revision: 7, suts: [...catalog.suts, { id: 'synthetic-c', name: 'Synthetic C', description: '', endpoints: {} }] })
  })
  it('keeps the ID fixed on edits and preserves other SUTs and the opening revision', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => response({ ...catalog, revision: 8 }))
    const saved = vi.fn()
    render(<SutEditor api={createProductApi(fetcher)} catalog={catalog} original={catalog.suts[0]} onClose={vi.fn()} onSaved={saved} />)
    expect(screen.getByLabelText('ID')).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Changed test name')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith('synthetic-a'))
    const sent = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(sent.revision).toBe(7)
    expect(sent.suts).toEqual([{ ...catalog.suts[0], name: 'Changed test name' }, catalog.suts[1]])
  })
  it('retains the draft and shows a conflict without silently retrying', async () => {
    const fetcher = vi.fn(async () => response({ error: 'SUT definitions changed. Reload before saving.' }, 409))
    const saved = vi.fn()
    render(<SutEditor api={createProductApi(fetcher)} catalog={catalog} original={catalog.suts[0]} onClose={vi.fn()} onSaved={saved} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload before saving')
    expect(saved).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Name')).toHaveValue('Synthetic A')
  })
  it('rejects malformed JSON before making a request', async () => {
    const fetcher = vi.fn()
    render(<SutEditor api={createProductApi(fetcher)} catalog={catalog} original={catalog.suts[0]} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Endpoints/), { target: { value: '{invalid' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('DataSet editor', () => {
  it('scopes new metadata to its selected SUT, preserving user-defined fields and lists', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => response({}))
    const saved = vi.fn()
    render(<DatasetEditor api={createProductApi(fetcher)} sut="synthetic-a" onClose={vi.fn()} onSaved={saved} />)
    fireEvent.change(screen.getByLabelText('Name / Redis namespace'), { target: { value: 'synthetic-cards' } })
    fireEvent.change(screen.getByLabelText(/Data lists/), { target: { value: 'ready, returned' } })
    const fields = [{ name: 'accountNumber', type: 'string', required: true }, { name: 'custom', type: 'boolean', required: false }]
    fireEvent.change(screen.getByLabelText(/Record fields/), { target: { value: JSON.stringify(fields) } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(fetcher).toHaveBeenCalledWith('/api/suts/synthetic-a/datasets', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ sutId: 'synthetic-a', name: 'synthetic-cards', description: '', fields, lists: ['ready', 'returned'] })
  })
})
