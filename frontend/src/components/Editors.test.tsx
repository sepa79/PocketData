import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createProductApi } from '../api/productApi'
import { catalog, datasets, response } from '../test/fixtures'
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
  it('rejects duplicate endpoint names instead of overwriting a row', async () => {
    const fetcher = vi.fn()
    render(<SutEditor api={createProductApi(fetcher)} catalog={catalog} original={catalog.suts[0]} onClose={vi.fn()} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))
    await userEvent.type(screen.getByLabelText('Endpoint name 2'), 'api')
    await userEvent.type(screen.getByLabelText('Address 2'), 'https://other.invalid')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Endpoint names must be unique')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('DataSet editor', () => {
  it('scopes new metadata to its selected SUT, preserving user-defined fields and lists', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => response({}))
    const saved = vi.fn()
    render(<DatasetEditor api={createProductApi(fetcher)} sut="synthetic-a" onClose={vi.fn()} onSaved={saved} />)
    fireEvent.change(screen.getByLabelText('Name / Redis namespace'), { target: { value: 'synthetic-cards' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add list' }))
    await userEvent.type(screen.getByLabelText('List name 2'), 'returned')
    const fields = [{ name: 'accountNumber', type: 'string', required: true }, { name: 'custom', type: 'boolean', required: false }]
    await userEvent.type(screen.getByLabelText('Field name 1'), 'accountNumber')
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }))
    await userEvent.type(screen.getByLabelText('Field name 2'), 'custom')
    await userEvent.selectOptions(screen.getByLabelText('Type 2'), 'boolean')
    expect(screen.getByLabelText('Full Redis key: synthetic-a:synthetic-cards:data:returned')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(fetcher).toHaveBeenCalledWith('/api/suts/synthetic-a/datasets', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ sutId: 'synthetic-a', name: 'synthetic-cards', description: '', fields, lists: ['ready', 'returned'] })
  })
  it('edits descriptions and adds optional fields/lists with the exact opening snapshot', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => response({}))
    const original = datasets[0].format
    render(<DatasetEditor api={createProductApi(fetcher)} sut="synthetic-a" original={original} onClose={vi.fn()} onSaved={vi.fn()} />)
    for (const label of ['Name / Redis namespace', 'Field name 1', 'Type 1', 'Required 1', 'List name 1']) expect(screen.getByLabelText(label)).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Description'))
    await userEvent.type(screen.getByLabelText('Description'), 'Updated description')
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }))
    await userEvent.type(screen.getByLabelText('Field name 2'), 'customerId')
    expect(screen.getByLabelText('Required 2')).toBeDisabled()
    expect(screen.getByLabelText('Required 2')).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(fetcher.mock.calls[0][0]).toBe('/api/suts/synthetic-a/datasets/cards')
    expect(fetcher.mock.calls[0][1]?.method).toBe('PUT')
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ expected: original, definition: { ...original, description: 'Updated description', fields: [...original.fields, { name: 'customerId', type: 'string', required: false }] } })
  })
  it('retains a DataSet draft after a stale edit and never retries automatically', async () => {
    const fetcher = vi.fn(async () => response({ error: 'DataSet changed. Reload before editing again.' }, 409))
    const saved = vi.fn()
    render(<DatasetEditor api={createProductApi(fetcher)} sut="synthetic-a" original={datasets[0].format} onClose={vi.fn()} onSaved={saved} />)
    await userEvent.clear(screen.getByLabelText('Description'))
    await userEvent.type(screen.getByLabelText('Description'), 'Unsaved draft')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload before editing again')
    expect(screen.getByLabelText('Description')).toHaveValue('Unsaved draft')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(saved).not.toHaveBeenCalled()
  })
})
