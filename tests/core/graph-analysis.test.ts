import { describe, expect, it } from 'vitest'
import { detectCycle } from 'wayflow/core'
import { edge, graph, node } from '../helpers'

// detectCycle reads only the edge list, so node ports are irrelevant here.
describe('detectCycle', () => {
  it('returns null for an acyclic chain', () => {
    const chain = graph(
      [
        node({ id: 'a', type: 'x' }),
        node({ id: 'b', type: 'x' }),
        node({ id: 'c', type: 'x' }),
      ],
      [edge('a', 'o', 'b', 'i'), edge('b', 'o', 'c', 'i')],
    )
    expect(detectCycle(chain)).toBeNull()
  })

  it('returns null for a diamond that reconverges without looping', () => {
    const diamond = graph(
      [
        node({ id: 'a', type: 'x' }),
        node({ id: 'b', type: 'x' }),
        node({ id: 'c', type: 'x' }),
        node({ id: 'd', type: 'x' }),
      ],
      [
        edge('a', 'o', 'b', 'i'),
        edge('a', 'o', 'c', 'i'),
        edge('b', 'o', 'd', 'i'),
        edge('c', 'o', 'd', 'i'),
      ],
    )
    expect(detectCycle(diamond)).toBeNull()
  })

  it('finds a two-node cycle as a closed path over both nodes', () => {
    const twoCycle = graph(
      [node({ id: 'a', type: 'x' }), node({ id: 'b', type: 'x' })],
      [edge('a', 'o', 'b', 'i'), edge('b', 'o', 'a', 'i')],
    )
    const cycle = detectCycle(twoCycle)

    expect(cycle).not.toBeNull()
    expect(cycle?.[0]).toBe(cycle?.at(-1))
    expect(new Set(cycle)).toEqual(new Set(['a', 'b']))
  })

  it('finds a self-loop', () => {
    const selfLoop = graph(
      [node({ id: 'a', type: 'x' })],
      [edge('a', 'o', 'a', 'i')],
    )
    expect(detectCycle(selfLoop)).toEqual(['a', 'a'])
  })
})
