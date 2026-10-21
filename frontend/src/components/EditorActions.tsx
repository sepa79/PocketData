export function EditorActions({ busy, error, onClose }: { busy: boolean; error: string; onClose: () => void }) {
  return <>
    {error ? <p role="alert" className="pd-error">{error}</p> : null}
    <div className="pd-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="pd-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
  </>
}
