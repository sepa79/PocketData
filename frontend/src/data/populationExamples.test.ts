import { describe, expect, it } from 'vitest'
import soapExample from '../../../examples/population-soap.json'
import jsonExample from './population-example.json'
import demoSut from '../../../examples/demo/sut.json'
import demoDataset from '../../../examples/demo/dataset.json'
import accountMock from '../../../examples/demo/wiremock/mappings/accounts.json'
import soap11Mock from '../../../examples/demo/wiremock/mappings/cards11.json'
import soap12Mock from '../../../examples/demo/wiremock/mappings/cards12.json'

describe('authored portable population examples', () => {
  it.each([[['JSON', 'SOAP11', 'SOAP12'], jsonExample], [['SOAP11'], soapExample]])('%s keeps calls standalone and separate from the PD loop/binding', (kinds, recipe) => {
    expect(Object.keys(recipe).sort()).toEqual(['count', 'name', 'params', 'steps', 'values'])
    expect(recipe.params).toEqual({})
    expect(Object.values(recipe.values).every(value => typeof value === 'string')).toBe(true)
    expect(recipe.steps).toHaveLength(kinds.length)
    recipe.steps.forEach((step, index) => {
      expect(Object.keys(step).sort()).toEqual(['call', 'endpoint', 'name'])
      expect(Object.keys(step.call).sort()).toEqual(['profile', 'request', 'requires', 'response'])
      expect(step.call.profile).toBe('portable-v1')
      expect(new Set(step.call.requires).size).toBe(step.call.requires.length)
      expect(Object.keys(step.call.request).sort()).toEqual(['bodyTemplate', 'callId', 'headersTemplate', 'method', 'pathTemplate', 'protocol', 'serviceId'])
      expect(step.call.request.protocol).toBe('HTTP')
      expect(Object.keys(step.call.response).sort()).toEqual(['expectedStatus', 'extract', 'kind', 'namespaces', 'soapAction'])
      expect(step.call.response.kind).toBe(kinds[index])
    })
    expect(JSON.stringify(recipe)).not.toMatch(/payload|endpointPath|responseKind|\bvars\b|\bctx\b/)
  })

  it('binds every default demo step to a matching mock and retains every extracted field', () => {
    expect(demoDataset.sutId).toBe(demoSut.id)
    expect(demoDataset.lists).toEqual(['ready', 'returned'])
    const endpoints: Record<string, string> = demoSut.endpoints
    const mocks = [accountMock, soap11Mock, soap12Mock]
    jsonExample.steps.forEach((step, index) => {
      const endpoint = new URL(endpoints[step.endpoint])
      expect(endpoint.origin).toBe('http://pocketdata-demo:8080')
      expect(mocks[index].request.urlPath).toBe(step.call.request.pathTemplate === '{{ endpoint.path }}' ? endpoint.pathname : step.call.request.pathTemplate)
      expect(mocks[index].response.status).toBe(step.call.response.expectedStatus)
      Object.keys(step.call.response.extract).forEach(name => expect(demoDataset.fields.some(field => field.name === name)).toBe(true))
    })
    expect(Object.keys(jsonExample.steps[1].call.response.extract)).toEqual(['cardNumber'])
    expect(Object.keys(jsonExample.steps[2].call.response.extract)).toEqual(['cardNumber12'])
  })

  it('authors dynamic JSON strings with the explicitly declared full-string escaper', () => {
    const call = jsonExample.steps[0].call
    expect(jsonExample.values.customer).toBe('000001')
    expect(call.requires).toEqual(['json_path', 'json_string'])
    expect(call.request.bodyTemplate).toBe('{"customer":{{ json_string(record.customer) }},"sequence":{{ params.iteration }}}')
    expect(call.response).toEqual({ kind: 'JSON', soapAction: '', expectedStatus: 201, extract: { accountNumber: '/accountNumber' }, namespaces: {} })
  })

  it('authors a complete SOAP11 envelope with explicit capabilities, XML escaping and endpoint binding', () => {
    const call = soapExample.steps[0].call
    expect(soapExample.values).toEqual({ customerId: '000example', accountNumber: '000example-account' })
    expect(call.requires).toEqual(['xml_path', 'xml_text', 'soap11'])
    expect(call.request.pathTemplate).toBe('{{ endpoint.path }}')
    expect(call.request.headersTemplate).toEqual({})
    expect(call.request.bodyTemplate).toContain('xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"')
    expect(call.request.bodyTemplate).toContain('xmlns:c="urn:example:cards"')
    expect(call.request.bodyTemplate).toContain('<c:customerId>{{ xml_text(record.customerId) }}</c:customerId>')
    expect(call.request.bodyTemplate).toContain('<c:accountNumber>{{ xml_text(record.accountNumber) }}</c:accountNumber>')
    expect(call.request.bodyTemplate).toMatch(/<soap:Body>.*<\/soap:Body><\/soap:Envelope>$/)
    expect(call.response).toEqual({
      kind: 'SOAP11', soapAction: 'urn:example:cards/CreateCard', expectedStatus: 200,
      extract: { cardNumber: '/soap:Envelope/soap:Body/c:CreateCardResponse/c:cardNumber' }, namespaces: { c: 'urn:example:cards' },
    })
  })
})
