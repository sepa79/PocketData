import type { ConnectionConfiguration } from '../api/types'

export type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'ready'; configuration: ConnectionConfiguration }
  | { kind: 'error'; message: string }
