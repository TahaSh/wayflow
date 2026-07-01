import { describe, expect, it } from 'vitest'
import {
  deselectAll,
  pruneSelection,
  type Selection,
  selectEdge,
  selectNode,
  toggleEdge,
  toggleNode,
} from 'wayflow/core'
import { edge, graph, node } from '../helpers'

const emptySelection = (): Selection => ({
  nodeIds: new Set(),
  edgeIds: new Set(),
})

describe('selection', () => {
  it('selects and toggles nodes', () => {
    const sel = emptySelection()
    selectNode(sel, 'a')
    expect(sel.nodeIds.has('a')).toBe(true)

    toggleNode(sel, 'a')
    expect(sel.nodeIds.has('a')).toBe(false)
    toggleNode(sel, 'a')
    expect(sel.nodeIds.has('a')).toBe(true)
  })

  it('selects and toggles edges', () => {
    const sel = emptySelection()
    selectEdge(sel, 'e1')
    expect(sel.edgeIds.has('e1')).toBe(true)

    toggleEdge(sel, 'e1')
    expect(sel.edgeIds.has('e1')).toBe(false)
  })

  it('clears everything on deselectAll', () => {
    const sel = emptySelection()
    selectNode(sel, 'a')
    selectEdge(sel, 'e1')

    deselectAll(sel)

    expect(sel.nodeIds.size).toBe(0)
    expect(sel.edgeIds.size).toBe(0)
  })

  it('drops selected ids no longer present in the graph', () => {
    const e = edge('a', 'o', 'b', 'i')
    const g = graph(
      [
        node({ id: 'a', type: 'x', outputs: ['o'] }),
        node({ id: 'b', type: 'x', inputs: ['i'] }),
      ],
      [e],
    )
    const sel: Selection = {
      nodeIds: new Set(['a', 'ghost']),
      edgeIds: new Set([e.id, 'ghost-edge']),
    }

    pruneSelection(sel, g)

    expect([...sel.nodeIds]).toEqual(['a'])
    expect([...sel.edgeIds]).toEqual([e.id])
  })
})
