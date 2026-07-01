import { describe, expect, it } from 'vitest'
import { DEFAULTS, type History, pushState, redo, undo } from 'wayflow/core'
import { graph, node } from '../helpers'

const emptyHistory = (): History => ({ undoStack: [], redoStack: [] })
const graphNamed = (id: string) => graph([node({ id, type: 'x' })])

describe('history', () => {
  it('returns null when there is nothing to undo or redo', () => {
    const history = emptyHistory()
    const current = graphNamed('a')
    expect(undo(history, current)).toBeNull()
    expect(redo(history, current)).toBeNull()
  })

  it('undo returns the previous state and redo restores the current one', () => {
    const history = emptyHistory()
    const g1 = graphNamed('a')
    const g2 = graphNamed('b')

    pushState(history, g1)
    expect(undo(history, g2)).toEqual(g1)
    expect(redo(history, g1)).toEqual(g2)
  })

  it('pushState clears the redo stack', () => {
    const history = emptyHistory()
    pushState(history, graphNamed('a'))
    undo(history, graphNamed('b'))
    expect(history.redoStack).toHaveLength(1)

    pushState(history, graphNamed('c'))
    expect(history.redoStack).toHaveLength(0)
  })

  it('caps the undo stack at the configured depth', () => {
    const history = emptyHistory()
    for (let i = 0; i < DEFAULTS.maxUndoDepth + 5; i++) {
      pushState(history, graphNamed(`n${i}`))
    }
    expect(history.undoStack).toHaveLength(DEFAULTS.maxUndoDepth)
  })
})
