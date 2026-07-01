import {
  type AnchoredOverlayHandle,
  createAnchoredOverlay,
  type VirtualAnchor,
} from './anchored-overlay'
import { createButton } from './controls'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  shortcut?: string
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

export interface ContextMenuController {
  open: (params: { point: VirtualAnchor; items: ContextMenuEntry[] }) => void
  close: () => void
  destroy: () => void
}

interface CreateContextMenuParams {
  // Locates the shell the floating menu mounts into.
  mountTarget: HTMLElement
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Item Rendering
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface MenuItemProps {
  item: ContextMenuItem
  onSelect: () => void
}

const createMenuItem = ({
  item,
  onSelect,
}: MenuItemProps): HTMLButtonElement => {
  const button = createButton({
    label: item.label,
    disabled: item.disabled,
    onClick: () => {
      item.onClick()
      onSelect()
    },
  })
  button.classList.add('wf-context-menu-item')
  if (item.shortcut) {
    const shortcut = document.createElement('span')
    shortcut.classList.add('wf-context-menu-shortcut')
    shortcut.textContent = item.shortcut
    button.appendChild(shortcut)
  }
  return button
}

const createSeparator = (): HTMLElement => {
  const separator = document.createElement('div')
  separator.classList.add('wf-context-menu-separator')
  return separator
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A reusable right-click menu anchored at a point. Each `open` replaces any menu
// already showing, so a fresh right-click repositions cleanly. Closes on
// outside click, Escape, or after an item runs.
export const createContextMenu = ({
  mountTarget,
}: CreateContextMenuParams): ContextMenuController => {
  let current: AnchoredOverlayHandle | null = null

  const close = () => {
    current?.destroy()
    current = null
  }

  const open = ({
    point,
    items,
  }: {
    point: VirtualAnchor
    items: ContextMenuEntry[]
  }) => {
    close()

    const menu = document.createElement('div')
    menu.classList.add('wf-context-menu')
    for (const entry of items) {
      menu.appendChild(
        'separator' in entry
          ? createSeparator()
          : createMenuItem({ item: entry, onSelect: close }),
      )
    }

    const overlay = createAnchoredOverlay({
      anchor: point,
      content: menu,
      align: 'left',
      mountTarget,
      onOpenChange: (isOpen) => {
        if (!isOpen) current = null
      },
    })
    current = overlay
    overlay.open()
  }

  return { open, close, destroy: close }
}
