import { DEFAULTS, type Graph } from './model'

export interface History {
  undoStack: Graph[]
  redoStack: Graph[]
}

export const pushState = (history: History, graph: Graph) => {
  if (history.undoStack.length >= DEFAULTS.maxUndoDepth) {
    history.undoStack.shift()
  }
  history.undoStack.push(JSON.parse(JSON.stringify(graph)))
  history.redoStack = []
}

export const undo = (history: History, currentGraph: Graph): Graph | null => {
  if (history.undoStack.length === 0) return null

  history.redoStack.push(JSON.parse(JSON.stringify(currentGraph)))

  return history.undoStack.pop()!
}

export const redo = (history: History, currentGraph: Graph): Graph | null => {
  if (history.redoStack.length === 0) return null

  history.undoStack.push(JSON.parse(JSON.stringify(currentGraph)))

  return history.redoStack.pop()!
}
