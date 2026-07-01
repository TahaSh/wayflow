import { BUTTON_VARIANT, type ButtonVariant, createButton } from './controls'
import { createWidthResizeHandle } from './resize'
import { type OverlayMount, resolveOverlayMount } from './shell'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Which edge the panel slides in from. 'bottom' suits small screens; 'right'
// is the desktop side overlay.
export const DRAWER_EDGE = { BOTTOM: 'bottom', RIGHT: 'right' } as const
export type DrawerEdge = (typeof DRAWER_EDGE)[keyof typeof DRAWER_EDGE]

const SHEET_PEEK = 0.3
const SHEET_EXPANDED = 0.86
const SHEET_DISMISS = 0.22
const SHEET_FLICK_MS = 120

// <input> types that don't summon the on-screen keyboard.
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
])

const summonsKeyboard = (el: Element | null): boolean => {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type)
  return false
}

export interface DrawerAction {
  label: string
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  closeOnClick?: boolean // default true
}

export interface CreateDrawerParams {
  edge: DrawerEdge
  title?: string
  content: HTMLElement
  // The last 'primary' action is bound to Enter for keyboard submit.
  actions?: DrawerAction[]
  anchor?: HTMLElement
  // A dimmed backdrop that traps interaction and closes on outside click. Off
  // for selection-driven overlays that must leave the canvas pannable beneath.
  backdrop?: boolean // default true
  // A shorter bottom drawer that leaves more of the canvas visible — for the
  // selection overlays, not full forms.
  compact?: boolean
  // Bottom edge only: a draggable peek/expanded bottom sheet (the mobile
  // inspector). A grab handle resizes it; at peek the canvas stays visible.
  sheet?: boolean
  // Sheet mode only: elements placed in the draggable header (e.g. node actions).
  headerActions?: HTMLElement[]
  // Where to attach the overlay (default 'shell'); see OverlayMount.
  mount?: OverlayMount
  // Called after the drawer closes (outside click, Escape, or an action).
  onClose?: () => void
  // Right edge only: a user-resizable, persisted width clamped to [min, max].
  resize?: {
    getWidth: () => number
    commit: (width: number) => void
    min: number
    max: number
  }
}

export interface DrawerHandle {
  element: HTMLElement
  open: () => void
  close: () => void
  setContent: (content: HTMLElement) => void
  collapse: () => void
  isOpen: () => boolean
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createDrawer = (params: CreateDrawerParams): DrawerHandle => {
  const withBackdrop = params.backdrop !== false

  const root = document.createElement('div')
  root.classList.add('wf-drawer-root', `wf-drawer-root-${params.edge}`)
  // Without a backdrop the root must not eat canvas pointer events — only the
  // panel itself is interactive.
  if (!withBackdrop) root.classList.add('wf-drawer-root-passthrough')

  const panel = document.createElement('div')
  panel.classList.add('wf-drawer', `wf-drawer-${params.edge}`)
  if (params.compact) panel.classList.add('wf-drawer-compact')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', String(withBackdrop))
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())

  const isSheet = params.sheet === true && params.edge === DRAWER_EDGE.BOTTOM
  let sheetHandle: HTMLElement | null = null
  if (isSheet) {
    panel.classList.add('wf-drawer-sheet')
    sheetHandle = document.createElement('div')
    sheetHandle.classList.add('wf-drawer-handle')
    if (params.headerActions?.length) {
      sheetHandle.append(...params.headerActions)
    } else {
      sheetHandle.classList.add('wf-drawer-handle-bare')
    }
    panel.appendChild(sheetHandle)
  }

  const areaHeight = () => root.getBoundingClientRect().height
  const heightFor = (size: 'peek' | 'expanded') =>
    Math.round(areaHeight() * (size === 'peek' ? SHEET_PEEK : SHEET_EXPANDED))
  const applySize = (size: 'peek' | 'expanded') => {
    panel.style.height = `${heightFor(size)}px`
  }

  if (params.title) {
    const header = document.createElement('div')
    header.classList.add('wf-drawer-header')
    header.textContent = params.title
    panel.appendChild(header)
  }

  const body = document.createElement('div')
  body.classList.add('wf-drawer-body')
  body.appendChild(params.content)
  panel.appendChild(body)

  let primaryAction: DrawerAction | undefined
  if (params.actions?.length) {
    const footer = document.createElement('div')
    footer.classList.add('wf-drawer-footer')
    for (const action of params.actions) {
      if (action.variant === BUTTON_VARIANT.PRIMARY) primaryAction = action
      footer.appendChild(
        createButton({
          label: action.label,
          variant: action.variant,
          disabled: action.disabled,
          onClick: () => {
            action.onClick?.()
            if (action.closeOnClick !== false) close()
          },
        }),
      )
    }
    panel.appendChild(footer)
  }

  root.appendChild(panel)

  let applyWidth: (() => void) | undefined
  if (params.edge === DRAWER_EDGE.RIGHT && params.resize) {
    const { getWidth, commit, min, max } = params.resize
    applyWidth = () => {
      panel.style.width = `${Math.max(min, Math.min(max, getWidth()))}px`
    }
    panel.appendChild(
      createWidthResizeHandle({
        side: 'right',
        min,
        max,
        getWidth,
        apply: (width) => {
          panel.style.width = `${width}px`
        },
        commit,
      }),
    )
  }

  let isOpen = false

  // Only close if the user pressed AND released on the backdrop — a drag that
  // starts inside the panel and ends outside should not close it.
  let pointerDownTarget: EventTarget | null = null
  if (withBackdrop) {
    root.addEventListener('pointerdown', (e) => {
      pointerDownTarget = e.target
    })
    root.addEventListener('click', (e) => {
      if (pointerDownTarget === root && e.target === root) close()
      pointerDownTarget = null
    })
  }

  // Lift a bottom drawer above the on-screen keyboard via the visual viewport
  // (which shrinks when the keyboard opens) — pad the overlay by the covered
  // height. The standard cross-browser approach; the viewport-meta resize hint
  // isn't honored everywhere. Gated on a focused text field so unrelated
  // viewport shifts (the URL bar settling on first touch) don't jolt the drawer.
  let detachKeyboard: (() => void) | undefined
  const trackKeyboard = () => {
    const vv = window.visualViewport
    if (!vv || params.edge !== DRAWER_EDGE.BOTTOM) return
    const sync = () => {
      const covered = summonsKeyboard(document.activeElement)
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0
      root.style.paddingBottom = covered ? `${covered}px` : ''
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    panel.addEventListener('focusin', sync)
    detachKeyboard = () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      panel.removeEventListener('focusin', sync)
    }
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
    } else if (
      e.key === 'Enter' &&
      primaryAction &&
      !primaryAction.disabled &&
      !(document.activeElement instanceof HTMLTextAreaElement)
    ) {
      primaryAction.onClick?.()
      if (primaryAction.closeOnClick !== false) close()
    }
  }

  const open = () => {
    if (isOpen) return
    applyWidth?.()
    resolveOverlayMount(params.mount, params.anchor).appendChild(root)
    document.addEventListener('keydown', onKeydown)
    isOpen = true
    if (isSheet) applySize('peek')
    void root.getBoundingClientRect()
    root.classList.add('wf-drawer-open')
    trackKeyboard()
    if (withBackdrop) {
      const firstField = body.querySelector<HTMLElement>(
        'input, select, textarea, button',
      )
      firstField?.focus({ preventScroll: true })
    }
  }

  const close = () => {
    if (!isOpen) return
    document.removeEventListener('keydown', onKeydown)
    detachKeyboard?.()
    root.classList.remove('wf-drawer-open')
    root.remove()
    isOpen = false
    params.onClose?.()
  }

  const setContent = (content: HTMLElement) => {
    body.replaceChildren(content)
  }

  const collapse = () => {
    if (isSheet && isOpen) applySize('peek')
  }

  // One resize gesture, fed live heights from either the grab handle (pointer)
  // or the content's pull-to-resize (touch); on release it carries the flick's
  // momentum and snaps to the nearest size, or dismisses.
  const beginSheetDrag = (startHeight: number) => {
    panel.classList.add('wf-drawer-sheet-dragging')
    const max = areaHeight()
    let lastH = startHeight
    let lastAt = performance.now()
    let velocity = 0
    return {
      move: (height: number) => {
        const h = Math.max(0, Math.min(max, height))
        panel.style.height = `${h}px`
        const now = performance.now()
        const dt = now - lastAt
        if (dt > 0) velocity = (h - lastH) / dt
        lastH = h
        lastAt = now
      },
      end: (height: number) => {
        panel.classList.remove('wf-drawer-sheet-dragging')
        // A pause before release isn't a flick, so only carry recent momentum.
        const recent = performance.now() - lastAt < 80
        const target = height + (recent ? velocity : 0) * SHEET_FLICK_MS
        if (target < max * SHEET_DISMISS) {
          close()
          return
        }
        applySize(
          Math.abs(target - heightFor('peek')) <
            Math.abs(target - heightFor('expanded'))
            ? 'peek'
            : 'expanded',
        )
      },
    }
  }

  if (sheetHandle) {
    sheetHandle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      const startY = e.clientY
      const startHeight = panel.getBoundingClientRect().height
      const gesture = beginSheetDrag(startHeight)
      const heightAt = (ev: PointerEvent) => startHeight + (startY - ev.clientY)
      const onMove = (ev: PointerEvent) => gesture.move(heightAt(ev))
      const onUp = (ev: PointerEvent) => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        gesture.end(heightAt(ev))
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    })

    // Pull-to-resize from the content: at the scroll top a downward drag
    // collapses or dismisses the sheet and an upward drag expands a peek,
    // otherwise the content scrolls. Gate on the scrollable under the finger
    // (results have their own scroller), and re-baseline at handoff so a scroll
    // turning into a drag doesn't jump.
    const scrollableUnder = (target: EventTarget | null) => {
      let el = target instanceof HTMLElement ? target : null
      while (el && el !== panel) {
        const oy = getComputedStyle(el).overflowY
        const scrolls = oy === 'auto' || oy === 'scroll'
        if (scrolls && el.scrollHeight > el.clientHeight) return el
        el = el.parentElement
      }
      return null
    }
    let gesture: ReturnType<typeof beginSheetDrag> | null = null
    let scroller: HTMLElement | null = null
    let baseY = 0
    let baseHeight = 0
    body.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return
        baseY = e.touches[0].clientY
        scroller = scrollableUnder(e.target)
        gesture = null
      },
      { passive: true },
    )
    body.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 1) return
        const y = e.touches[0].clientY
        if (!gesture) {
          const dy = y - baseY
          const expanded =
            panel.getBoundingClientRect().height >= heightFor('expanded') - 1
          const atTop = !scroller || scroller.scrollTop <= 0
          const pullDownAtTop = dy > 0 && atTop
          const pullUpWhilePeeking = dy < 0 && !expanded
          if (!pullDownAtTop && !pullUpWhilePeeking) {
            baseY = y
            return
          }
          baseY = y
          baseHeight = panel.getBoundingClientRect().height
          gesture = beginSheetDrag(baseHeight)
        }
        e.preventDefault()
        gesture.move(baseHeight - (y - baseY))
      },
      { passive: false },
    )
    const endTouch = (e: TouchEvent) => {
      if (!gesture) return
      const y = e.changedTouches[0]?.clientY ?? baseY
      gesture.end(baseHeight - (y - baseY))
      gesture = null
    }
    body.addEventListener('touchend', endTouch)
    body.addEventListener('touchcancel', endTouch)

    // A focused text field expands the sheet so the keyboard doesn't bury it.
    panel.addEventListener('focusin', (e) => {
      if (summonsKeyboard(e.target as Element | null)) applySize('expanded')
    })
  }

  const destroy = () => {
    document.removeEventListener('keydown', onKeydown)
    detachKeyboard?.()
    root.remove()
    isOpen = false
  }

  return {
    element: root,
    open,
    close,
    setContent,
    collapse,
    isOpen: () => isOpen,
    destroy,
  }
}
