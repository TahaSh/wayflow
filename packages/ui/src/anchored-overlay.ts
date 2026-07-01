import { getShellMount } from './shell'

// A fixed-position point in viewport coordinates — used to anchor a menu at the
// cursor rather than beside an element (e.g. a context menu).
export interface VirtualAnchor {
  x: number
  y: number
}

export interface AnchoredOverlayParams {
  anchor: HTMLElement | VirtualAnchor
  content: HTMLElement
  align?: 'left' | 'right'
  onOpenChange?: (open: boolean) => void
  // Required when `anchor` is a point: locates the shell to mount into.
  mountTarget?: HTMLElement
}

export interface AnchoredOverlayHandle {
  open: () => void
  close: () => void
  toggle: () => void
  destroy: () => void
}

// Floats `content` beside `anchor` — flips above when there's no room below,
// closes on outside pointerdown or Escape, and mounts at the shell root so it
// escapes any clipping ancestor. Shared by the dropdown menu and ImageInput popover.
export const createAnchoredOverlay = (
  params: AnchoredOverlayParams,
): AnchoredOverlayHandle => {
  const { anchor, content } = params
  let isOpen = false

  const anchorBounds = () =>
    anchor instanceof HTMLElement
      ? anchor.getBoundingClientRect()
      : { top: anchor.y, bottom: anchor.y, left: anchor.x, right: anchor.x }

  const position = () => {
    content.style.position = 'fixed'

    const anchorRect = anchorBounds()
    const { width, height } = content.getBoundingClientRect()
    const gap = 4
    const margin = 8
    const spaceBelow = window.innerHeight - anchorRect.bottom - margin
    const spaceAbove = anchorRect.top - margin
    const placeAbove = spaceBelow < height + gap && spaceAbove > spaceBelow

    content.style.top = placeAbove
      ? `${anchorRect.top - height - gap}px`
      : `${anchorRect.bottom + gap}px`

    // Anchor to the left or right edge, then clamp into the viewport so a wide
    // overlay near a screen edge isn't cut off.
    const desiredLeft =
      params.align === 'left' ? anchorRect.left : anchorRect.right - width
    const maxLeft = window.innerWidth - width - margin
    content.style.left = `${Math.max(margin, Math.min(desiredLeft, maxLeft))}px`
    content.style.right = ''
  }

  const onDocumentPointerDown = (e: PointerEvent) => {
    if (content.contains(e.target as Node)) return
    if (anchor instanceof HTMLElement && anchor.contains(e.target as Node)) {
      return
    }
    close()
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }

  const open = () => {
    if (isOpen) return
    const mountRef = anchor instanceof HTMLElement ? anchor : params.mountTarget
    getShellMount(mountRef).appendChild(content)
    position()
    // Capture phase so outside-click closes even where a region stops pointerdown.
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onKeydown)
    isOpen = true
    params.onOpenChange?.(true)
  }

  const close = () => {
    if (!isOpen) return
    content.remove()
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
    isOpen = false
    params.onOpenChange?.(false)
  }

  const toggle = () => {
    if (isOpen) close()
    else open()
  }

  return { open, close, toggle, destroy: close }
}
