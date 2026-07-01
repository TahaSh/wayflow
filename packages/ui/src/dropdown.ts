import {
  type AnchoredOverlayHandle,
  createAnchoredOverlay,
} from './anchored-overlay'
import { createButton } from './controls'

export interface DropdownItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface CreateDropdownMenuParams {
  anchor: HTMLElement
  items: DropdownItem[]
  align?: 'left' | 'right'
  onOpenChange?: (open: boolean) => void
}

export type DropdownHandle = AnchoredOverlayHandle

export const createDropdownMenu = (
  params: CreateDropdownMenuParams,
): DropdownHandle => {
  const menu = document.createElement('div')
  menu.classList.add('wf-dropdown-menu')

  const overlay = createAnchoredOverlay({
    anchor: params.anchor,
    content: menu,
    align: params.align,
    onOpenChange: params.onOpenChange,
  })

  for (const item of params.items) {
    const btn = createButton({
      label: item.label,
      onClick: () => {
        item.onClick()
        overlay.close()
      },
      disabled: item.disabled,
    })
    btn.classList.add('wf-dropdown-item')
    menu.appendChild(btn)
  }

  return overlay
}
