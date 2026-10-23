export interface PopulationRequest {
  serviceId: string
  callId: string
  protocol: 'HTTP'
  method: string
  pathTemplate: string
  headersTemplate: Record<string, string>
  bodyTemplate: string
}

export type PortableHttpCapability = 'json_path' | 'json_string' | 'xml_path' | 'xml_text' | 'xml_attr' | 'soap11' | 'soap12'

export interface PortableHttpResponse {
  kind: 'JSON' | 'SOAP11' | 'SOAP12'
  soapAction: string
  expectedStatus: number
  extract: Record<string, string>
  namespaces: Record<string, string>
}

export interface PortableHttpCall {
  profile: 'portable-v1'
  requires: PortableHttpCapability[]
  request: PopulationRequest
  response: PortableHttpResponse
}

export interface PopulationStep {
  name: string
  endpoint: string
  call: PortableHttpCall
}

export interface PopulationRecipe {
  name: string
  count: number
  pacing: PopulationPacing
  values: Record<string, string>
  params: Record<string, string>
  steps: PopulationStep[]
}

export type PopulationPacingUnit = 'MILLISECONDS' | 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS'

export interface PopulationPacing {
  mode: 'DELAY' | 'RATE'
  value: number
  unit: PopulationPacingUnit
}

export interface PopulationTarget {
  sut: string
  dataset: string
  list: string
}

export interface PopulationJob {
  id: string
  status: 'RUNNING' | 'STOPPING' | 'STOPPED' | 'SUCCEEDED' | 'FAILED'
  total: number
  completed: number
  published: number
  iteration: number
  step: string
  error: string
  inventoryId: string
  pacing: PopulationPacing
  elapsedMs: number
  achievedPerSecond: number
  waiting: boolean
  waitRemainingMs: number
}
