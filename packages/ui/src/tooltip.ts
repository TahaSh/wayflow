import { getViewportMount } from './shell'

export interface AttachTooltipOptions {
  position?: 'top' | 'bottom' | 'auto'
  delay?: number | (() => number | undefined)
}

export interface TooltipHandle {
  destroy: () => void
  // Re-evaluates the content of an open tooltip, hiding it if there's no longer
  // any (e.g. the anchor's state changed while hovered).
  refresh: () => void
}

export const attachTooltip = (
  anchor: HTMLElement,
  getContent: () => string | HTMLElement | null,
  options: AttachTooltipOptions = {},
): TooltipHandle => {
  const resolveDelay = (): number => {
    const { delay } = options
    return (typeof delay === 'function' ? delay() : delay) ?? 400
  }
  const preferred = options.position ?? 'auto'

  let tooltipEl: HTMLElement | null = null
  let showTimer: number | null = null

  const position = (el: HTMLElement) => {
    const anchorRect = anchor.getBoundingClientRect()
    const tipRect = el.getBoundingClientRect()

    let placeAbove = preferred !== 'bottom'
    if (preferred === 'auto') {
      placeAbove = anchorRect.top >= tipRect.height + 8
    }

    const top = placeAbove
      ? anchorRect.top - tipRect.height - 6
      : anchorRect.bottom + 6

    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2
    const margin = 4
    left = Math.max(
      margin,
      Math.min(window.innerWidth - tipRect.width - margin, left),
    )

    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide()
  }

  const hide = () => {
    if (showTimer !== null) {
      window.clearTimeout(showTimer)
      showTimer = null
    }
    if (tooltipEl) {
      tooltipEl.remove()
      tooltipEl = null
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('keydown', onKeydown)
    }
  }

  const show = () => {
    if (tooltipEl) return
    const content = getContent()
    if (!content) return

    const el = document.createElement('div')
    el.classList.add('wf-tooltip')
    el.style.position = 'fixed'
    if (typeof content === 'string') el.textContent = content
    else el.appendChild(content)

    getViewportMount(anchor).appendChild(el)
    position(el)
    tooltipEl = el

    document.addEventListener('scroll', hide, true)
    document.addEventListener('keydown', onKeydown)
  }

  const refresh = () => {
    if (!tooltipEl) return
    const content = getContent()
    if (!content) return hide()
    if (typeof content === 'string') tooltipEl.textContent = content
    else tooltipEl.replaceChildren(content)
    position(tooltipEl)
  }

  const onEnter = () => {
    if (showTimer !== null || tooltipEl) return
    const ms = resolveDelay()
    if (ms <= 0) {
      show()
      return
    }
    showTimer = window.setTimeout(() => {
      showTimer = null
      show()
    }, ms)
  }

  anchor.addEventListener('mouseenter', onEnter)
  anchor.addEventListener('mouseleave', hide)

  return {
    destroy: () => {
      hide()
      anchor.removeEventListener('mouseenter', onEnter)
      anchor.removeEventListener('mouseleave', hide)
    },
    refresh,
  }
}
