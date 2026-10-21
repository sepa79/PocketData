import type { PopulationJob, PopulationRecipe, PopulationTarget } from '../api/populationTypes'

export const populationTarget: PopulationTarget = { sut: 'synthetic-a', dataset: 'cards', list: 'returned' }
export const populationRecipe: PopulationRecipe = {
  name: 'Synthetic SOAP only', count: 2, values: { customer: '001', extra: 'retain' }, params: { customer: '009', iteration: '999' },
  steps: [{
    name: 'Create card', endpoint: 'api', call: {
      profile: 'portable-v1', requires: ['xml_path', 'xml_text', 'xml_attr', 'soap12'],
      request: {
        serviceId: 'cards', callId: 'create', protocol: 'HTTP', method: 'POST', pathTemplate: '{{ endpoint.path }}',
        headersTemplate: {}, bodyTemplate: '<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:card="urn:synthetic:cards"><env:Body><card:Create customer="{{ xml_attr(params.customer) }}"><card:customer>{{ xml_text(record.customer) }}</card:customer></card:Create></env:Body></env:Envelope>',
      },
      response: {
        kind: 'SOAP12', soapAction: 'urn:create', expectedStatus: 200,
        extract: { accountNumber: '/soap:Envelope/soap:Body/card:Created/card:number/text()' }, namespaces: { card: 'urn:synthetic:cards' },
      },
    },
  }],
}

export const populationJob: PopulationJob = {
  id: 'synthetic-job', status: 'RUNNING', total: 2, completed: 0, published: 0, iteration: 1,
  step: 'Create card', error: '', inventoryId: '',
}
