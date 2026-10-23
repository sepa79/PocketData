export interface SutDefinition {
  id: string
  name: string
  description: string
  endpoints: Record<string, string>
}

export interface CatalogSnapshot {
  revision: number
  suts: SutDefinition[]
}

export interface ConnectionConfiguration {
  redisConfigured: boolean
  authConfigured: boolean
  redisCommanderUrl: string
}

export interface RecordField {
  name: string
  type: 'string' | 'integer' | 'number' | 'boolean'
  required: boolean
}

export interface DatasetDefinition {
  sutId: string
  name: string
  description: string
  fields: RecordField[]
  lists: string[]
}

export interface DatasetSummary {
  format: DatasetDefinition
  counts: Record<string, number>
}

export interface InventoryFile {
  id: string
  bytes: number
}

export interface ImportResult {
  id: string
  published: number
}

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
