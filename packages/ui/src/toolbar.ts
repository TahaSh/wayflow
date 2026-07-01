import { createDropdownMenu, type DropdownItem } from './dropdown'
import { createIcon, type IconName } from './icons'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const ZOOM_PRESETS = [0.25, 0.5, 1, 1.5, 2] as const

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface CreateToolbarParams {
  container: HTMLElement
  position?: 'top' | 'bottom'
  target?: HTMLElement
  initialZoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomTo: (zoom: number) => void
  onFitView: () => void
  onUndo: () => void
  onRedo: () => void
  // Show the undo/redo controls. Off for the non-editing presentation modes.
  history?: boolean
}

export interface ToolbarHandle {
  element: HTMLElement
  setZoom: (zoom: number) => void
  setUndoEnabled: (enabled: boolean) => void
  setRedoEnabled: (enabled: boolean) => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createToolbar = ({
  container,
  position = 'bottom',
  target,
  initialZoom,
  onZoomIn,
  onZoomOut,
  onZoomTo,
  onFitView,
  onUndo,
  onRedo,
  history = true,
}: CreateToolbarParams): ToolbarHandle => {
  const toolbar = document.createElement('div')
  toolbar.classList.add('wf-toolbar', `wf-toolbar-${position}`)

  const zoomOutBtn = createToolbarButton({
    icon: 'minus',
    title: 'Zoom out',
    onClick: onZoomOut,
  })
  const zoomReadout = createZoomReadout(initialZoom, onZoomTo)
  const zoomInBtn = createToolbarButton({
    icon: 'plus',
    title: 'Zoom in',
    onClick: onZoomIn,
  })
  const fitBtn = createToolbarButton({
    icon: 'maximize',
    title: 'Fit view',
    iconSize: 13,
    onClick: onFitView,
  })
  toolbar.append(
    zoomOutBtn,
    zoomReadout.element,
    zoomInBtn,
    createDivider(),
    fitBtn,
  )

  let undoBtn: HTMLButtonElement | undefined
  let redoBtn: HTMLButtonElement | undefined
  if (history) {
    undoBtn = createToolbarButton({
      icon: 'undo',
      title: 'Undo',
      iconSize: 13,
      onClick: onUndo,
      disabled: true,
    })
    redoBtn = createToolbarButton({
      icon: 'redo',
      title: 'Redo',
      iconSize: 13,
      onClick: onRedo,
      disabled: true,
    })
    toolbar.append(createDivider(), undoBtn, redoBtn)
  }

  const mountTarget = target ?? container
  mountTarget.appendChild(toolbar)

  return {
    element: toolbar,
    setZoom: zoomReadout.setZoom,
    setUndoEnabled: (enabled) => {
      if (undoBtn) undoBtn.disabled = !enabled
    },
    setRedoEnabled: (enabled) => {
      if (redoBtn) redoBtn.disabled = !enabled
    },
    destroy: () => {
      zoomReadout.destroy()
      toolbar.remove()
    },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ToolbarButtonProps {
  icon: IconName
  title: string
  onClick: () => void
  iconSize?: number
  disabled?: boolean
}

const createToolbarButton = (props: ToolbarButtonProps): HTMLButtonElement => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('wf-toolbar-button')
  btn.title = props.title
  btn.setAttribute('aria-label', props.title)
  if (props.disabled) btn.disabled = true
  btn.appendChild(createIcon({ name: props.icon, size: props.iconSize ?? 14 }))
  btn.addEventListener('click', props.onClick)
  return btn
}

const createDivider = (): HTMLElement => {
  const el = document.createElement('span')
  el.classList.add('wf-toolbar-divider')
  return el
}

interface ZoomReadout {
  element: HTMLButtonElement
  setZoom: (zoom: number) => void
  destroy: () => void
}

const createZoomReadout = (
  initialZoom: number,
  onZoomTo: (zoom: number) => void,
): ZoomReadout => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('wf-toolbar-zoom')
  btn.textContent = formatZoom(initialZoom)

  const items: DropdownItem[] = ZOOM_PRESETS.map((zoom) => ({
    label: formatZoom(zoom),
    onClick: () => onZoomTo(zoom),
  }))
  const dropdown = createDropdownMenu({
    anchor: btn,
    items,
    align: 'left',
  })
  btn.addEventListener('click', () => dropdown.toggle())

  return {
    element: btn,
    setZoom: (zoom) => {
      btn.textContent = formatZoom(zoom)
    },
    destroy: dropdown.destroy,
  }
}

const formatZoom = (zoom: number): string => `${Math.round(zoom * 100)}%`
