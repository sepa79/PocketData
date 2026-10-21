import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="pd-empty"><strong>{title}</strong>{children ? <p>{children}</p> : null}</div>
}
