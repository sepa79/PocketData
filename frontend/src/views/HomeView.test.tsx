import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ConnectionState } from '../hooks/ConnectionState'
import { HomeView } from './HomeView'

function show(connections: ConnectionState, refreshing = false) {
  const onRefresh = vi.fn()
  render(<MemoryRouter><HomeView connections={connections} refreshing={refreshing} onRefresh={onRefresh} /></MemoryRouter>)
  return onRefresh
}

describe('Home connection configuration', () => {
  it('uses the full logo with the subtitle aligned beneath the entire wordmark', () => {
    show({ kind: 'loading' })
    expect(screen.getByRole('img', { name: 'PocketData' })).toHaveAttribute('src', '/pocketdata-logo.svg')
    const source = readFileSync('public/pocketdata-logo.svg', 'utf8')
    const logo = new DOMParser().parseFromString(source, 'image/svg+xml')
    const wordmark = logo.querySelector('#wordmark')!
    const tagline = logo.querySelector('#tagline')!
    expect(tagline.textContent).toBe('simple test data')
    expect(tagline.getAttribute('x')).toBe(wordmark.getAttribute('x'))
    expect(tagline.getAttribute('textLength')).toBe(wordmark.getAttribute('textLength'))
    expect(Number(tagline.getAttribute('y'))).toBeGreaterThan(Number(wordmark.getAttribute('y')))
    expect(logo.documentElement.getAttribute('viewBox')).toBe('0 0 720 280')
    expect(logo.querySelector('g')!.getAttribute('transform')).toBe('translate(6 38) scale(2.6)')
    expect(wordmark.getAttribute('x')).toBe('260')
    expect(wordmark.getAttribute('y')).toBe('148')
    expect(wordmark.getAttribute('textLength')).toBe('420')
    expect(wordmark.getAttribute('lengthAdjust')).toBe('spacing')
    expect(tagline.getAttribute('lengthAdjust')).toBe('spacing')
    const compact = new DOMParser().parseFromString(readFileSync('public/pocketdata-topbar.svg', 'utf8'), 'image/svg+xml')
    expect(compact.querySelectorAll('text')).toHaveLength(1)
    expect(compact.querySelector('text')!.getAttribute('textLength')).toBe(wordmark.getAttribute('textLength'))
    expect(compact.querySelector('text')!.getAttribute('lengthAdjust')).toBe('spacing')
  })

  it('gives Redis and PH Auth separate cards without claiming live health', async () => {
    const refresh = show({ kind: 'ready', configuration: { redisConfigured: true, authConfigured: true, redisCommanderUrl: '' } })
    expect(within(screen.getByRole('article', { name: 'Redis' })).getByText('Configured')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'PocketHive Auth' })).getByText('Configured')).toBeVisible()
    expect(screen.getByText(/not a live health check/)).toBeVisible()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('distinguishes missing configuration for each service', () => {
    show({ kind: 'ready', configuration: { redisConfigured: false, authConfigured: true, redisCommanderUrl: '' } })
    expect(within(screen.getByRole('article', { name: 'Redis' })).getByText('Not configured')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'PocketHive Auth' })).getByText('Configured')).toBeVisible()
  })

  it('does not invent service statuses while loading', () => {
    show({ kind: 'loading' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading connection configuration')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  })

  it('shows an escaped error instead of treating an unavailable API as unconfigured', () => {
    show({ kind: 'error', message: '<script>untrusted</script>' })
    expect(screen.getByRole('alert')).toHaveTextContent('<script>untrusted</script>')
    expect(document.querySelector('script')).toBeNull()
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('offers read-only shortcuts to each workspace section', () => {
    show({ kind: 'loading' })
    const shortcuts = within(screen.getByRole('navigation', { name: 'Workspace shortcuts' }))
    expect(shortcuts.getByRole('link', { name: /SUTs/ })).toHaveAttribute('href', '/suts')
    expect(shortcuts.getByRole('link', { name: /DataSets/ })).toHaveAttribute('href', '/datasets')
    expect(shortcuts.getByRole('link', { name: /CSV inventory/ })).toHaveAttribute('href', '/inventory')
  })
})
