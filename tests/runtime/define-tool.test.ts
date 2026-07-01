import { describe, expect, it } from 'vitest'
import { defineTool, defineToolMetadata } from 'wayflow/runtime'

const ctx = { signal: new AbortController().signal, runGraph: async () => ({}) }

describe('defineTool', () => {
  it('builds an object schema with every arg required', async () => {
    const tool = defineTool({
      description: 'Add two numbers',
      args: {
        a: 'number',
        b: { type: 'number', description: 'the addend' },
      },
      handler: async ({ a, b }) => a + b,
    })

    expect(tool.description).toBe('Add two numbers')
    expect(tool.parameters).toEqual({
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', description: 'the addend' },
      },
      required: ['a', 'b'],
    })
  })

  it('passes parsed args through to the handler', async () => {
    const tool = defineTool({
      description: 'Add',
      args: { a: 'number', b: 'number' },
      handler: async ({ a, b }) => a + b,
    })

    expect(await tool.handler({ a: 2, b: 3 }, ctx)).toBe(5)
  })
})

describe('defineToolMetadata', () => {
  it('builds the same parameters without a handler', () => {
    const meta = defineToolMetadata({
      description: 'Search',
      args: { query: 'string' },
    })

    expect(meta).toEqual({
      description: 'Search',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    })
  })
})
