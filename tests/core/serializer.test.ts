import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from 'wayflow/core'
import { edge, graph, node } from '../helpers'

describe('serializer', () => {
  it('round-trips a well-formed graph unchanged', () => {
    const g = graph(
      [
        node({ id: 'a', type: 'value', outputs: ['o'] }),
        node({ id: 'b', type: 'output', inputs: ['i'] }),
      ],
      [edge('a', 'o', 'b', 'i')],
    )

    expect(deserialize(serialize(g))).toEqual(g)
  })

  it('drops edges whose endpoints no longer resolve', () => {
    const a = node({ id: 'a', type: 'value', outputs: ['o'] })
    const json = JSON.stringify({
      version: 1,
      graph: {
        nodes: { a },
        edges: {
          e1: {
            id: 'e1',
            sourceNodeId: 'a',
            sourcePortId: 'o',
            targetNodeId: 'ghost',
            targetPortId: 'i',
          },
        },
      },
    })

    expect(deserialize(json).edges).toEqual({})
  })

  it('throws on malformed input', () => {
    expect(() => deserialize('not json')).toThrowError(/Failed to deserialize/)
    expect(() =>
      deserialize(JSON.stringify({ version: 1, graph: {} })),
    ).toThrow()
  })
})
