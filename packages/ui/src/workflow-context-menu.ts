import type { Editor } from '@wayflow/dom'
import { type ContextMenuEntry, createContextMenu } from './context-menu'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Shortcut Hints
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl+'
const DELETE_HINT = isMac ? '⌫' : 'Del'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface WorkflowContextMenuHandle {
  destroy: () => void
}

// Turns the editor's right-click event into the workflow's node and canvas
// menus, each wired to the editor's own actions.
export const createWorkflowContextMenu = ({
  editor,
}: {
  editor: Editor
}): WorkflowContextMenuHandle => {
  const menu = createContextMenu({ mountTarget: editor.getContainer() })

  const unsubscribe = editor.on('contextmenu', (payload) => {
    const { nodeId, selectionSize, canPaste, canvas, client } = payload

    const items: ContextMenuEntry[] = nodeId
      ? [
          {
            label: 'Copy',
            shortcut: `${MOD}C`,
            onClick: () => editor.copySelection(),
          },
          {
            label: 'Cut',
            shortcut: `${MOD}X`,
            onClick: () => editor.cutSelection(),
          },
          {
            label: 'Duplicate',
            shortcut: `${MOD}D`,
            onClick: () => editor.duplicateSelection(),
          },
          {
            label: 'Rename',
            disabled: selectionSize > 1,
            onClick: () => editor.beginRename(nodeId),
          },
          { separator: true },
          {
            label:
              selectionSize > 1 ? `Delete ${selectionSize} nodes` : 'Delete',
            shortcut: DELETE_HINT,
            onClick: () => editor.deleteSelection(),
          },
        ]
      : [
          {
            label: 'Paste',
            shortcut: `${MOD}V`,
            disabled: !canPaste,
            onClick: () => editor.paste({ atCanvas: canvas }),
          },
          {
            label: 'Select all',
            shortcut: `${MOD}A`,
            onClick: () => editor.selectAll(),
          },
          { label: 'Fit view', onClick: () => editor.fitView() },
        ]

    menu.open({ point: client, items })
  })

  return {
    destroy: () => {
      unsubscribe()
      menu.destroy()
    },
  }
}
