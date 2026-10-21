import { useEffect, useRef, type ReactNode } from 'react'

export function Dialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const outsideDown = useRef(false)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  function outside(clientX: number, clientY: number) {
    const bounds = dialog.current!.getBoundingClientRect()
    return clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom
  }
  return (
    <dialog ref={dialog} id="editor" className="pd-dialog" aria-labelledby="editor-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
      onPointerDown={event => { outsideDown.current = outside(event.clientX, event.clientY) }}
      onPointerUp={event => {
        if (outsideDown.current && outside(event.clientX, event.clientY) && !busy) onClose()
        outsideDown.current = false
      }}>
      <div className="pd-dialog-heading"><h2 id="editor-title">{title}</h2><button type="button" className="pd-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></div>
      {children}
    </dialog>
  )
}
