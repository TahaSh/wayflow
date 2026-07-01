// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Width resize handle — a drag strip that resizes and persists an element's
//  width. Shared by the docked inspector panel and its drawer.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface WidthResizeParams {
  side: 'left' | 'right'
  min: number
  max: number
  getWidth: () => number
  apply: (width: number) => void
  commit: (width: number) => void
}

const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n))

// One-way arrow at the bounds: a right-anchored element grows by dragging west,
// so at its min width the cursor points west.
const cursorFor = (
  width: number,
  side: 'left' | 'right',
  min: number,
  max: number,
): string => {
  if (width <= min) return side === 'right' ? 'w-resize' : 'e-resize'
  if (width >= max) return side === 'right' ? 'e-resize' : 'w-resize'
  return 'ew-resize'
}

export const createWidthResizeHandle = ({
  side,
  min,
  max,
  getWidth,
  apply,
  commit,
}: WidthResizeParams): HTMLElement => {
  const handle = document.createElement('div')
  handle.classList.add('wf-resize-handle')
  handle.dataset.side = side === 'right' ? 'left' : 'right'

  let startX = 0
  let width = 0
  let dragging = false

  const setCursor = (value: number) => {
    const cursor = cursorFor(value, side, min, max)
    handle.style.cursor = cursor
    if (dragging) document.body.style.cursor = cursor
  }

  const onMove = (e: PointerEvent) => {
    width = clamp(
      width + (side === 'right' ? -1 : 1) * (e.clientX - startX),
      min,
      max,
    )
    startX = e.clientX
    apply(width)
    setCursor(width)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onEnd)
    commit(width)
  }

  handle.addEventListener('pointerdown', (e) => {
    dragging = true
    startX = e.clientX
    width = clamp(getWidth(), min, max)
    document.body.style.userSelect = 'none'
    setCursor(width)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    e.preventDefault()
  })

  setCursor(clamp(getWidth(), min, max))
  return handle
}
