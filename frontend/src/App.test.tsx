import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { response, syntheticFetch } from './test/fixtures'

const auth = vi.hoisted(() => ({
  session: { user: null as { username: string; displayName: string } | null, canEdit: false, configured: true },
  loading: false, signingIn: false,
  confirmationUrl: null as string | null, error: null as { code: string; message: string } | null,
  signIn: vi.fn(), cancelSignIn: vi.fn(), signOut: vi.fn(), openConfirmation: vi.fn(), fetchWithAuth: vi.fn(),
}))
vi.mock('@pockethive/browser-auth', () => ({ usePocketAuth: () => auth }))
beforeEach(() => {
  auth.session = { user: null, canEdit: false, configured: true }
  auth.loading = false
  auth.signingIn = false
  auth.confirmationUrl = null
  auth.error = null
  auth.fetchWithAuth.mockImplementation(syntheticFetch())
})
function show(path = '/suts') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>) }

describe('PocketData shared-shell application', () => {
  it('opens population in the existing shared shell with the selected SUT and scoped DataSet', async () => {
    show()
    await screen.findByRole('option', { name: 'Synthetic A' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Selected SUT' }), 'synthetic-a')
    await userEvent.click(screen.getByRole('link', { name: 'Population' }))
    expect(await screen.findByRole('heading', { name: 'Scripted population' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'DataSet' })).toHaveValue('cards')
    expect(screen.getByText('Population requires local-admin')).toBeVisible()
    expect(document.querySelectorAll('header')).toHaveLength(1)
    expect(document.querySelectorAll('main')).toHaveLength(1)
  })
  it('opens Home by default with connection cards and links into the workspace', async () => {
    show('/')
    expect(screen.getByRole('heading', { name: 'PocketData' })).toBeVisible()
    expect(within(screen.getByRole('link', { name: 'PocketData home' })).getByRole('img')).toHaveAttribute('src', '/pocketdata-topbar.svg')
    expect(await screen.findByRole('article', { name: 'Redis' })).toHaveTextContent('Configured')
    const shortcuts = screen.getByRole('navigation', { name: 'Workspace shortcuts' })
    await userEvent.click(within(shortcuts).getByRole('link', { name: /SUTs/ }))
    expect(await screen.findByRole('heading', { name: 'Systems under test' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Redis' })).not.toBeInTheDocument()
    expect(screen.queryByText(/PH Auth configured/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'PocketData home' }))
    expect(screen.getByRole('heading', { name: 'PocketData' })).toBeVisible()
  })

  it('refreshes the authoritative connection flags from Home', async () => {
    const base = syntheticFetch()
    let configured = true
    auth.fetchWithAuth.mockImplementation((input: RequestInfo | URL, options?: RequestInit) => String(input) === '/api/connections'
      ? Promise.resolve(response({ redisConfigured: configured, authConfigured: configured })) : base(input, options))
    show('/')
    await waitFor(() => expect(screen.getByRole('article', { name: 'Redis' })).toHaveTextContent('Configured'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
    configured = false
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('article', { name: 'Redis' })).toHaveTextContent('Not configured'))
    expect(screen.getByRole('article', { name: 'PocketHive Auth' })).toHaveTextContent('Not configured')
  })

  it('offers central sign-out confirmation again when its tab was blocked', async () => {
    auth.confirmationUrl = 'http://localhost:8089/auth-service/oauth/device/logout?client_id=pocketdata-device'
    auth.error = { code: 'popup_blocked', message: 'PH confirmation could not open.' }
    show()
    expect(screen.getByText('Open PocketHive to confirm shared sign-out.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open PocketHive' }))
    expect(auth.openConfirmation).toHaveBeenCalled()
  })
  it('shows version and data as escaped text with anonymous read-only actions', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Synthetic A' })).toBeVisible()
    expect(screen.getByText('<script>not executable</script>')).toBeVisible()
    expect(document.querySelector('script')).toBeNull()
    expect(await screen.findByText('v0.1.0-dev')).toBeVisible()
    expect(screen.getByRole('button', { name: 'View only · Sign in' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '＋ SUT' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('header')).toHaveLength(1)
    expect(document.querySelectorAll('main')).toHaveLength(1)
  })
  it('uses the shared collapsible rail and persists its explicit preference', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Expand view sidebar' }))
    expect(screen.getByRole('button', { name: 'Collapse view sidebar' })).toHaveAttribute('aria-expanded', 'true')
    expect(sessionStorage.getItem('PD_UI_NAV')).toBe('expanded')
    await userEvent.click(screen.getByRole('button', { name: 'Collapse view sidebar' }))
    expect(sessionStorage.getItem('PD_UI_NAV')).toBe('collapsed')
  })
  it('scopes DataSets by the selected SUT and shows counts, empty lists and metadata', async () => {
    show('/datasets')
    expect(screen.getByText('Select a SUT first')).toBeVisible()
    await screen.findByRole('option', { name: 'Synthetic A' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Selected SUT' }), 'synthetic-a')
    expect(await screen.findByRole('heading', { name: 'cards' })).toBeVisible()
    expect(screen.getByText('12 records')).toBeVisible()
    expect(screen.getByText('0 records')).toBeVisible()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Selected SUT' }), 'synthetic-b')
    expect(await screen.findByText('No DataSets in this SUT')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'cards' })).not.toBeInTheDocument()
  })
  it('uses canEdit from the shared session, never a username-derived editor flag', async () => {
    auth.session = { user: { username: 'local-admin', displayName: 'Denied inactive user' }, canEdit: false, configured: true }
    show()
    await screen.findByRole('option', { name: 'Synthetic A' })
    expect(screen.getByRole('button', { name: 'local-admin · Sign out' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '＋ SUT' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'local-admin · Sign out' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })
  it('opens SUT edits for an authorized editor and dismisses without writes', async () => {
    auth.session = { user: { username: 'local-admin', displayName: 'Test administrator' }, canEdit: true, configured: true }
    show()
    await screen.findByRole('button', { name: '＋ SUT' })
    await waitFor(() => expect(screen.getByRole('button', { name: '＋ SUT' })).toBeEnabled())
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByRole('dialog', { name: 'Edit SUT' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(auth.fetchWithAuth.mock.calls.some(call => call[1]?.method)).toBe(false)
  })
  it('delegates sign-in and cancellation to the shared hook', async () => {
    const mounted = show()
    await userEvent.click(screen.getByRole('button', { name: 'View only · Sign in' }))
    expect(auth.signIn).toHaveBeenCalledTimes(1)
    auth.signingIn = true
    mounted.rerender(<MemoryRouter><App /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Open PocketHive' }))
    expect(auth.openConfirmation).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Waiting for PH · Cancel' }))
    expect(auth.cancelSignIn).toHaveBeenCalledTimes(1)
  })
  it('removes an open editor when shared-session permission is lost', async () => {
    auth.session = { user: { username: 'local-admin', displayName: 'Test administrator' }, canEdit: true, configured: true }
    const mounted = show()
    await waitFor(() => expect(screen.getByRole('button', { name: '＋ SUT' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '＋ SUT' }))
    expect(screen.getByRole('dialog', { name: 'New SUT' })).toBeVisible()
    auth.session = { user: null, canEdit: false, configured: true }
    mounted.rerender(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '＋ SUT' })).not.toBeInTheDocument()
  })
  it('ignores a late DataSet response after the user switches SUTs', async () => {
    const base = syntheticFetch()
    let finishFirst: (response: Response) => void = () => { throw new Error('First DataSet request not started') }
    auth.fetchWithAuth.mockImplementation((input: RequestInfo | URL, options?: RequestInit) => String(input) === '/api/suts/synthetic-a/datasets' ? new Promise(resolve => { finishFirst = resolve }) : base(input, options))
    show('/datasets')
    await screen.findByRole('option', { name: 'Synthetic A' })
    const selector = screen.getByRole('combobox', { name: 'Selected SUT' })
    await userEvent.selectOptions(selector, 'synthetic-a')
    await userEvent.selectOptions(selector, 'synthetic-b')
    expect(await screen.findByText('No DataSets in this SUT')).toBeVisible()
    finishFirst(response([{ format: { sutId: 'synthetic-a', name: 'stale-result', description: '', fields: [], lists: [] }, counts: {} }]))
    await waitFor(() => expect(screen.queryByText('stale-result')).not.toBeInTheDocument())
    expect(selector).toHaveValue('synthetic-b')
  })
  it('shows a Redis outage as an explicit failure, not an empty DataSet list', async () => {
    const base = syntheticFetch()
    auth.fetchWithAuth.mockImplementation((input: RequestInfo | URL, options?: RequestInit) => String(input).endsWith('/datasets') ? Promise.resolve(response({ error: 'Redis is unavailable.' }, 503)) : base(input, options))
    show('/datasets')
    await screen.findByRole('option', { name: 'Synthetic A' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Selected SUT' }), 'synthetic-a')
    expect(await screen.findByRole('alert')).toHaveTextContent('Redis is unavailable')
    expect(screen.queryByText('No DataSets in this SUT')).not.toBeInTheDocument()
  })
})
