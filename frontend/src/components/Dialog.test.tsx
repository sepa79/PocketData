import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('editor dismissal', () => {
  function show(busy = false) {
    const close = vi.fn()
    render(<Dialog title="Synthetic editor" busy={busy} onClose={close}><button>Inner action</button></Dialog>)
    const dialog = screen.getByRole('dialog')
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 500, top: 100, bottom: 500 } as DOMRect)
    return { dialog, close }
  }
  it('opens modally and closes with its close button', () => {
    const { dialog, close } = show()
    expect(dialog).toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('handles Escape through the native cancel event', () => {
    const { dialog, close } = show()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('only dismisses a pointer gesture that begins and ends on the backdrop', () => {
    const { dialog, close } = show()
    fireEvent.pointerDown(dialog, { clientX: 200, clientY: 200 })
    fireEvent.pointerUp(dialog, { clientX: 20, clientY: 20 })
    expect(close).not.toHaveBeenCalled()
    fireEvent.pointerDown(dialog, { clientX: 20, clientY: 20 })
    fireEvent.pointerUp(dialog, { clientX: 20, clientY: 20 })
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('keeps pending writes open on Escape, backdrop and Close', () => {
    const { dialog, close } = show(true)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.pointerDown(dialog, { clientX: 20, clientY: 20 })
    fireEvent.pointerUp(dialog, { clientX: 20, clientY: 20 })
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(close).not.toHaveBeenCalled()
  })
})
