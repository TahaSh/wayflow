import {
  BUTTON_VARIANT,
  createButton,
  createFieldLabel,
  createIconButton,
  createTextInput,
} from './controls'
import { openDialog } from './dialog'
import { createIcon } from './icons'
import type { PreviewFooterOptions, PreviewKeyButtonOptions } from './mode'
import { THEME, type Theme } from './theme'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const DEFAULT_CAPTION = 'Drag to pan · pinch to zoom · Run to see output'
const DEFAULT_KEY_LABEL = 'API key'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Zoom Control
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CreateZoomControlParams {
  initialZoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
}

export interface ZoomControlHandle {
  element: HTMLElement
  setZoom: (zoom: number) => void
}

export const createZoomControl = (
  params: CreateZoomControlParams,
): ZoomControlHandle => {
  const group = document.createElement('div')
  group.classList.add('wf-zoom-control')

  const value = document.createElement('span')
  value.classList.add('wf-zoom-control-value')
  value.textContent = formatZoom(params.initialZoom)

  const divider = document.createElement('span')
  divider.classList.add('wf-zoom-control-divider')

  group.append(
    createIconButton({
      icon: 'minus',
      label: 'Zoom out',
      onClick: params.onZoomOut,
    }),
    value,
    createIconButton({
      icon: 'plus',
      label: 'Zoom in',
      onClick: params.onZoomIn,
    }),
    divider,
    createIconButton({
      icon: 'maximize',
      label: 'Fit view',
      onClick: params.onFitView,
    }),
  )

  return {
    element: group,
    setZoom: (zoom) => {
      value.textContent = formatZoom(zoom)
    },
  }
}

const formatZoom = (zoom: number): string => `${Math.round(zoom * 100)}%`

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Theme Toggle
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CreateThemeToggleParams {
  getResolvedTheme: () => Theme
  onToggle: (next: Theme) => void
}

export const createThemeToggle = ({
  getResolvedTheme,
  onToggle,
}: CreateThemeToggleParams): HTMLButtonElement => {
  const button = createIconButton({
    icon: 'sun',
    label: 'Toggle theme',
    size: 14,
    onClick: () => {
      const light = getResolvedTheme() === THEME.LIGHT
      onToggle(light ? THEME.DARK : THEME.LIGHT)
      sync()
    },
  })

  const sync = () => {
    const light = getResolvedTheme() === THEME.LIGHT
    button.replaceChildren(
      createIcon({ name: light ? 'moon' : 'sun', size: 14 }),
    )
    button.title = light ? 'Switch to dark' : 'Switch to light'
    button.setAttribute('aria-label', button.title)
  }
  sync()

  return button
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Key Button (bring-your-own-key)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CreateKeyButtonParams extends PreviewKeyButtonOptions {
  anchor: HTMLElement
}

export const createKeyButton = (
  params: CreateKeyButtonParams,
): HTMLButtonElement => {
  const idleLabel = params.label ?? DEFAULT_KEY_LABEL
  const button = createButton({
    label: idleLabel,
    icon: 'key',
    iconSize: 12,
    onClick: () => openKeyDialog(params, idleLabel, sync),
  })

  const sync = () => {
    const active = params.isActive?.() ?? false
    const label = active ? (params.activeLabel ?? idleLabel) : idleLabel
    button.replaceChildren(
      createIcon({ name: 'key', size: 12 }),
      document.createTextNode(label),
    )
    button.title = label
    button.classList.toggle('wf-key-button-active', active)
  }
  sync()

  return button
}

const openKeyDialog = (
  params: CreateKeyButtonParams,
  title: string,
  onSaved: () => void,
): void => {
  let value = ''
  const content = document.createElement('div')
  content.classList.add('wf-modal-fields')
  content.appendChild(createFieldLabel({ text: title }))
  content.appendChild(
    createTextInput({
      value: '',
      placeholder: 'Paste your key…',
      onChange: (v) => {
        value = v
      },
    }),
  )

  openDialog({
    title,
    content,
    anchor: params.anchor,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save',
        variant: BUTTON_VARIANT.PRIMARY,
        onClick: () => {
          params.onSubmit(value)
          onSaved()
        },
      },
    ],
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Footer
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createPreviewFooter = (
  options: PreviewFooterOptions,
): HTMLElement => {
  const footer = document.createElement('div')
  footer.classList.add('wf-preview-footer')

  const caption =
    options.caption === undefined ? DEFAULT_CAPTION : options.caption
  if (caption !== false) {
    const captionEl = document.createElement('span')
    captionEl.classList.add('wf-preview-footer-caption')
    captionEl.textContent = caption
    footer.appendChild(captionEl)
  }

  if (options.end) {
    const endEl = document.createElement('span')
    endEl.classList.add('wf-preview-footer-end')
    endEl.textContent = options.end
    footer.appendChild(endEl)
  }

  return footer
}
