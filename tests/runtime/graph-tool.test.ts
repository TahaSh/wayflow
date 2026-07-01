import { describe, expect, it } from 'vitest'
import { ERROR_CODE } from 'wayflow/agent'
import { graphsToTools, graphToTool } from 'wayflow/runtime'
import { graph, node } from '../helpers'

const ctx = { signal: new AbortController().signal, runGraph: async () => ({}) }

// A graph whose single Input node declares the tool's parameters: `topic` has no
// default (required), `count` has one (optional).
const researchGraph = graph([
  node({
    id: 'in',
    type: 'input',
    data: {
      fields: [
        { name: 'topic', dataType: 'string' },
        { name: 'count', dataType: 'number', default: 3 },
      ],
    },
    outputs: ['topic'],
  }),
])

describe('graphToTool', () => {
  it('derives parameters from the Input fields', () => {
    const tool = graphToTool(researchGraph, { description: 'Research a topic' })

    expect(tool.description).toBe('Research a topic')
    expect(tool.parameters).toEqual({
      type: 'object',
      properties: {
        topic: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['topic'],
    })
  })

  it('falls back to the graph description', () => {
    const described = {
      ...researchGraph,
      metadata: { description: 'From meta' },
    }
    expect(graphToTool(described).description).toBe('From meta')
  })

  it('runs the graph with the call args when invoked', async () => {
    let received: Record<string, unknown> | undefined
    const tool = graphToTool(researchGraph)
    const out = await tool.handler(
      { topic: 'otters' },
      {
        ...ctx,
        runGraph: async (_g, inputs) => {
          received = inputs
          return { ok: true }
        },
      },
    )

    expect(out).toEqual({ ok: true })
    expect(received).toEqual({ topic: 'otters' })
  })
})

describe('graphsToTools', () => {
  it('keys each graph by its snake-cased name', () => {
    const named = { ...researchGraph, metadata: { name: 'Research Topic' } }
    const tools = graphsToTools([named])

    expect(Object.keys(tools)).toEqual(['research_topic'])
  })

  it('rejects a graph with no name', () => {
    expect(() => graphsToTools([researchGraph])).toThrowError(
      expect.objectContaining({ code: ERROR_CODE.RUNTIME_TOOL_NO_NAME }),
    )
  })
})
