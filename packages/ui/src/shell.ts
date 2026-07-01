export const getShellMount = (anchor?: HTMLElement): Element =>
  anchor?.closest('.wf-shell') ?? document.body

// Token names harvested once from the injected stylesheet, so they stay in sync
// with the CSS.
let designTokenNames: string[] | null = null

const getDesignTokenNames = (): string[] => {
  if (designTokenNames) return designTokenNames
  const css = document.querySelector('[data-wf-ui-styles]')?.textContent ?? ''
  const names = [...new Set(css.match(/--wf-[\w-]+/g) ?? [])]
  if (names.length) designTokenNames = names
  return names
}

// Mirror a shell's resolved tokens onto the host so brand overrides on the
// editor element (e.g. --wf-accent) reach dialogs that escape to <body>.
const mirrorDesignTokens = (source: Element, host: HTMLElement): void => {
  const computed = getComputedStyle(source)
  for (const name of getDesignTokenNames()) {
    const value = computed.getPropertyValue(name).trim()
    if (value) host.style.setProperty(name, value)
  }
}

// A viewport-level overlay host on <body>, carrying the editor's theme + design
// tokens (a `.wf-shell` scope), so a dialog isn't clipped by an embedded
// editor's box. Reused across opens; mirrors the originating shell's theme and
// token overrides.
export const getViewportMount = (anchor?: HTMLElement): HTMLElement => {
  let host = document.querySelector<HTMLElement>('body > .wf-overlay-portal')
  if (!host) {
    host = document.createElement('div')
    host.classList.add('wf-shell', 'wf-overlay-portal')
    document.body.appendChild(host)
  }
  const shell = anchor?.closest('.wf-shell')
  if (shell && shell !== host) {
    const theme = shell.getAttribute('data-theme')
    if (theme) host.setAttribute('data-theme', theme)
    mirrorDesignTokens(shell, host)
  }
  return host
}

// Where an overlay attaches: 'shell' stays inside the editor (clipped to it,
// for canvas-coexisting overlays); 'viewport' escapes to a body-level layer
// (for modal dialogs that must not be clipped by an embedded editor's box).
export const OVERLAY_MOUNT = { SHELL: 'shell', VIEWPORT: 'viewport' } as const
export type OverlayMount = (typeof OVERLAY_MOUNT)[keyof typeof OVERLAY_MOUNT]

export const resolveOverlayMount = (
  mount: OverlayMount | undefined,
  anchor?: HTMLElement,
): Element =>
  mount === OVERLAY_MOUNT.VIEWPORT
    ? getViewportMount(anchor)
    : getShellMount(anchor)
