import './style.css'
import { createEditor } from '@wayflow/dom'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Drive the @wayflow/dom canvas directly — no shell,
//  no node palette, no config panel. You bring the UI:
//  here, custom node content and your own toolbar.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const editorEl = document.getElementById('editor')!

const stepButton = (label: string, onClick: () => void) => {
  const button = document.createElement('button')
  button.textContent = label
  button.style.cssText = `
    width: 26px;
    height: 26px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  `
  button.addEventListener('click', onClick)
  return button
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Custom node content
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const editor = createEditor(editorEl, {
  nodeRenderers: {
    // An interactive node: a number with − / + buttons that write back to the
    // node's data via updateData. The renderer returns its dataChange
    // subscription as the cleanup, so the value re-syncs on undo / import.
    counter: (container, { node, updateData }) => {
      let value = (node.data.value as number) ?? 0

      const valueEl = document.createElement('span')
      valueEl.style.cssText =
        'min-width: 3ch; text-align: center; font-size: 18px; font-variant-numeric: tabular-nums;'
      const render = () => {
        valueEl.textContent = String(value)
      }
      render()

      const step = (delta: number) => () => {
        value += delta
        updateData({ value })
        render()
      }

      const row = document.createElement('div')
      row.style.cssText =
        'display: flex; gap: 8px; align-items: center; justify-content: center;'
      row.append(stepButton('−', step(-1)), valueEl, stepButton('+', step(1)))
      container.appendChild(row)

      return editor.on('dataChange', ({ nodeId, data }) => {
        if (nodeId !== node.id) return
        value = (data.value as number) ?? 0
        render()
      })
    },

    // A read-only mirror of the counter. Its value lives on this node's own
    // data (kept in sync below), so it reads correctly on load and after an
    // export/import — and re-renders on its own dataChange.
    display: (container, { node }) => {
      const valueEl = document.createElement('div')
      valueEl.style.cssText =
        'text-align: center; font-size: 22px; font-variant-numeric: tabular-nums;'
      const render = (v: number) => {
        valueEl.textContent = String(v)
      }
      render((node.data.value as number) ?? 0)
      container.appendChild(valueEl)

      return editor.on('dataChange', ({ nodeId, data }) => {
        if (nodeId !== node.id) return
        render((data.value as number) ?? 0)
      })
    },
  },
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Build your own toolbar
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const styleButton = (btn: HTMLButtonElement) => {
  btn.style.cssText = `
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: inherit;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  `
}

const exportBtn = document.createElement('button')
exportBtn.textContent = 'Export'
styleButton(exportBtn)
exportBtn.addEventListener('click', () => {
  const blob = new Blob([editor.export()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'graph.json'
  a.click()
  URL.revokeObjectURL(url)
})

const importBtn = document.createElement('button')
importBtn.textContent = 'Import'
styleButton(importBtn)
importBtn.addEventListener('click', () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (file) editor.import(await file.text())
  })
  input.click()
})

const toolbar = document.createElement('div')
toolbar.style.cssText = `
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  z-index: 10;
`
toolbar.append(exportBtn, importBtn)
editorEl.appendChild(toolbar)

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Seed a Counter wired to a Display
//
//  editor.untracked() keeps these mutations out of the
//  undo history. The dom layer has no data flow, so the
//  Display is kept in sync with the Counter by hand.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

editor.untracked(() => {
  const counter = editor.addNode({
    type: 'counter',
    label: 'Counter',
    position: { x: 120, y: 200 },
    data: { value: 0 },
    ports: [{ id: 'value', label: 'Value', side: 'output' }],
  })

  const display = editor.addNode({
    type: 'display',
    label: 'Display',
    position: { x: 440, y: 200 },
    data: { value: 0 },
    ports: [{ id: 'value', label: 'Value', side: 'input' }],
  })

  editor.addEdge({
    sourceNodeId: counter.id,
    sourcePortId: 'value',
    targetNodeId: display.id,
    targetPortId: 'value',
  })

  // Mirror the Counter's value onto the Display's own data so it survives an
  // export/import; untracked keeps the mirror out of the undo history.
  editor.on('dataChange', ({ nodeId, data }) => {
    if (nodeId !== counter.id || typeof data.value !== 'number') return
    editor.untracked(() => {
      editor.updateNodeData(display.id, { value: data.value })
    })
  })
})
