import { pluralize } from '@wayflow/core'
import { PERSISTENCE_STATE, type PersistenceState } from '@wayflow/dom'
import {
  BUTTON_VARIANT,
  type ButtonVariant,
  createBadge,
  createButton,
  TONE,
} from './controls'
import { createDropdownMenu, type DropdownItem } from './dropdown'
import { createIcon, type IconName } from './icons'

// How long the "Saved" pill lingers before fading out.
const SAVED_VISIBLE_MS = 2000

export interface HeaderAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'primary'
  disabled?: boolean
  title?: string
}

export interface HeaderPrimaryAction {
  label: string
  onClick: () => void
  menuItems?: DropdownItem[]
  icon?: IconName
}

export interface CreateHeaderParams {
  target: HTMLElement
  title?: string | (() => HTMLElement)
  actions?: HeaderAction[]
  // Pre-built controls placed in the action cluster, before the run status and
  // primary button (e.g. the preview shell's zoom + key controls).
  actionElements?: HTMLElement[]
  primaryAction?: HeaderPrimaryAction
  titleMenu?: DropdownItem[]
  // Show the run-state dot beside the name (the embeddable/preview surface).
  showRunState?: boolean
}

// The run-state dot shown beside the workflow name.
export const RUN_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
} as const

export type RunState = (typeof RUN_STATE)[keyof typeof RUN_STATE]

export const HEADER_STATUS_TONE = {
  DEFAULT: 'default',
  ERROR: 'error',
  SUCCESS: 'success',
} as const

export type HeaderStatusTone =
  (typeof HEADER_STATUS_TONE)[keyof typeof HEADER_STATUS_TONE]

export interface SetStatusParams {
  text: string
  tone?: HeaderStatusTone
  onClick?: () => void
}

export interface SetPrimaryActionParams {
  label: string
  onClick: () => void
  variant?: ButtonVariant
  icon?: IconName
}

export interface SetIssuesParams {
  count: number
  onClick?: () => void
}

export interface SetSaveStatusParams {
  state: PersistenceState | null
  onRetry?: () => void
}

export interface HeaderHandle {
  element: HTMLElement
  setRunState: (state: RunState) => void
  setStatus: (params: SetStatusParams) => void
  setIssues: (params: SetIssuesParams) => void
  setSaveStatus: (params: SetSaveStatusParams) => void
  setTitle: (title: string) => void
  setTitleLoading: (loading: boolean) => void
  setPrimaryDisabled: (disabled: boolean) => void
  setPrimaryLabel: (label: string) => void
  setPrimaryAction: (params: SetPrimaryActionParams) => void
  destroy: () => void
}

export const createHeader = (params: CreateHeaderParams): HeaderHandle => {
  const header = document.createElement('div')
  header.classList.add('wf-shell-header')

  const titleCluster = document.createElement('div')
  titleCluster.classList.add('wf-shell-header-title-cluster')

  const runDot = document.createElement('span')
  runDot.classList.add('wf-shell-header-dot')
  runDot.dataset.state = RUN_STATE.IDLE
  if (params.showRunState) titleCluster.appendChild(runDot)

  // Function-form titles render caller-owned DOM — don't wrap them in our
  // button (would nest <button>s if the caller already used one).
  const titleIsFunction = typeof params.title === 'function'
  const hasTitleMenu = (params.titleMenu?.length ?? 0) > 0 && !titleIsFunction
  const titleHasOverride = titleIsFunction || typeof params.title === 'string'

  const titleEl = document.createElement(hasTitleMenu ? 'button' : 'div')
  titleEl.classList.add('wf-shell-header-title')

  const titleText = document.createElement('span')
  titleText.classList.add('wf-shell-header-title-text')
  if (typeof params.title === 'function') {
    titleEl.appendChild(params.title())
  } else {
    if (params.title) titleText.textContent = params.title
    titleEl.appendChild(titleText)
  }

  if (hasTitleMenu) {
    titleEl.classList.add('wf-shell-header-title-trigger')
    titleEl.dataset.active = 'false'
    const titleMenu = createDropdownMenu({
      anchor: titleEl,
      items: params.titleMenu!,
      align: 'left',
      onOpenChange: (open) => {
        titleEl.dataset.active = open ? 'true' : 'false'
      },
    })
    titleEl.addEventListener('click', () => titleMenu.toggle())
  }

  titleCluster.appendChild(titleEl)

  const saveStatus = createSaveStatusIndicator()
  titleCluster.appendChild(saveStatus.element)

  header.appendChild(titleCluster)

  const actionsEl = document.createElement('div')
  actionsEl.classList.add('wf-shell-header-actions')
  header.appendChild(actionsEl)

  const issuesEl = document.createElement('span')
  issuesEl.classList.add('wf-shell-header-issues')
  actionsEl.appendChild(issuesEl)

  const statusEl = document.createElement('span')
  statusEl.classList.add('wf-shell-header-status')
  if (params.primaryAction) actionsEl.appendChild(statusEl)

  if (params.actions) {
    for (const action of params.actions) {
      actionsEl.appendChild(createButton(action))
    }
  }

  if (params.actionElements) {
    for (const el of params.actionElements) actionsEl.appendChild(el)
  }

  let primaryButton: HTMLButtonElement | null = null
  let splitArrowButton: HTMLButtonElement | null = null
  const initialPrimaryClick = params.primaryAction?.onClick

  if (params.primaryAction) {
    if (params.primaryAction.menuItems?.length) {
      const splitWrapper = document.createElement('div')
      splitWrapper.classList.add('wf-split-button')

      primaryButton = createButton({
        label: params.primaryAction.label,
        variant: BUTTON_VARIANT.PRIMARY,
        onClick: params.primaryAction.onClick,
        icon: params.primaryAction.icon,
        iconSize: 10,
      })
      primaryButton.classList.add('wf-split-main')

      splitArrowButton = createButton({
        label: '',
        variant: BUTTON_VARIANT.PRIMARY,
        onClick: () => dropdown.toggle(),
        title: 'More run options',
      })
      splitArrowButton.classList.add('wf-split-arrow')
      splitArrowButton.appendChild(createChevronDownIcon())

      const dropdown = createDropdownMenu({
        anchor: splitArrowButton,
        items: params.primaryAction.menuItems,
        align: 'right',
      })

      splitWrapper.append(primaryButton, splitArrowButton)
      actionsEl.appendChild(splitWrapper)
    } else {
      primaryButton = createButton({
        label: params.primaryAction.label,
        variant: BUTTON_VARIANT.PRIMARY,
        onClick: params.primaryAction.onClick,
        icon: params.primaryAction.icon,
        iconSize: 10,
      })
      actionsEl.appendChild(primaryButton)
    }
  }

  // Header is always the topmost child of its mount target — prepend so it lands
  // above any siblings already added (e.g., the .wf-shell-row created earlier).
  params.target.prepend(header)

  let currentStatusClick: (() => void) | null = null
  let currentPrimaryClick: (() => void) | null = initialPrimaryClick ?? null

  return {
    element: header,
    setRunState: (state) => {
      runDot.dataset.state = state
    },
    setStatus: ({ text, tone = HEADER_STATUS_TONE.DEFAULT, onClick }) => {
      // Split "Completed · 473 ms · 3 nodes" into a primary word + detail so
      // compact viewports can keep the word and drop the metrics.
      statusEl.replaceChildren()
      if (text) {
        const sep = text.indexOf(' · ')
        const primary = document.createElement('span')
        primary.classList.add('wf-shell-header-status-primary')
        primary.textContent = sep === -1 ? text : text.slice(0, sep)
        statusEl.appendChild(primary)
        if (sep !== -1) {
          const detail = document.createElement('span')
          detail.classList.add('wf-shell-header-status-detail')
          detail.textContent = text.slice(sep)
          statusEl.appendChild(detail)
        }
      }
      statusEl.classList.remove(
        'wf-shell-header-status-error',
        'wf-shell-header-status-success',
        'wf-shell-header-status-clickable',
      )
      if (tone === HEADER_STATUS_TONE.ERROR)
        statusEl.classList.add('wf-shell-header-status-error')
      else if (tone === HEADER_STATUS_TONE.SUCCESS)
        statusEl.classList.add('wf-shell-header-status-success')

      if (currentStatusClick) {
        statusEl.removeEventListener('click', currentStatusClick)
        currentStatusClick = null
      }
      if (onClick) {
        statusEl.classList.add('wf-shell-header-status-clickable')
        statusEl.addEventListener('click', onClick)
        currentStatusClick = onClick
      }
    },
    setIssues: ({ count, onClick }) => {
      issuesEl.replaceChildren()
      if (count === 0) return
      issuesEl.appendChild(
        createBadge({
          tone: TONE.WARNING,
          label: pluralize(count, 'issue'),
          dot: true,
          onClick,
        }),
      )
    },
    setSaveStatus: ({ state, onRetry }) =>
      saveStatus.setState(state, { onRetry }),
    setTitle: (title) => {
      // Caller-pinned title (string or function) wins — don't override.
      if (titleHasOverride) return
      titleText.textContent = title
      titleEl.classList.toggle('wf-shell-header-title-empty', !title)
    },
    setTitleLoading: (loading) => {
      if (titleHasOverride) return
      titleEl.classList.toggle('wf-shell-header-title-loading', loading)
    },
    setPrimaryDisabled: (disabled) => {
      if (primaryButton) primaryButton.disabled = disabled
    },
    setPrimaryLabel: (label) => {
      if (primaryButton) primaryButton.textContent = label
    },
    setPrimaryAction: ({
      label,
      onClick,
      variant = BUTTON_VARIANT.PRIMARY,
      icon,
    }) => {
      if (!primaryButton) return
      primaryButton.replaceChildren()
      if (icon) primaryButton.appendChild(createIcon({ name: icon, size: 10 }))
      primaryButton.appendChild(document.createTextNode(label))
      primaryButton.classList.remove(
        'wf-control-button-primary',
        'wf-control-button-danger',
      )
      if (variant === BUTTON_VARIANT.PRIMARY)
        primaryButton.classList.add('wf-control-button-primary')
      else if (variant === BUTTON_VARIANT.DANGER)
        primaryButton.classList.add('wf-control-button-danger')
      // Hide the split-button dropdown arrow when the primary is in a
      // non-primary state (e.g., Cancel) — its menu items don't apply mid-run.
      if (splitArrowButton) {
        splitArrowButton.hidden = variant !== BUTTON_VARIANT.PRIMARY
      }
      if (currentPrimaryClick) {
        primaryButton.removeEventListener('click', currentPrimaryClick)
      }
      primaryButton.addEventListener('click', onClick)
      currentPrimaryClick = onClick
    },
    destroy: () => {
      header.remove()
    },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Save Status
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface SaveStatusIndicator {
  element: HTMLElement
  setState: (
    state: PersistenceState | null,
    opts?: { onRetry?: () => void },
  ) => void
}

const createSaveStatusIndicator = (): SaveStatusIndicator => {
  const element = document.createElement('span')
  element.classList.add('wf-shell-header-save-status')
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  let previous: PersistenceState | null = null

  const show = (badge: HTMLElement | null): void => {
    clearTimeout(fadeTimer)
    fadeTimer = undefined
    element.replaceChildren(...(badge ? [badge] : []))
  }

  return {
    element,
    setState: (state, opts) => {
      const prior = previous
      previous = state
      switch (state) {
        case PERSISTENCE_STATE.LOADING:
          return show(
            createBadge({ tone: TONE.MUTED, label: 'Loading…', dot: true }),
          )
        case PERSISTENCE_STATE.DRAFT:
          return show(
            createBadge({ tone: TONE.WARNING, label: 'Draft', dot: true }),
          )
        case PERSISTENCE_STATE.SAVING:
          return show(
            createBadge({ tone: TONE.MUTED, label: 'Saving…', dot: true }),
          )
        case PERSISTENCE_STATE.ERROR:
          return show(
            createBadge({
              tone: TONE.ERROR,
              label: 'Save failed',
              dot: true,
              onClick: opts?.onRetry,
            }),
          )
        case PERSISTENCE_STATE.SAVED:
          if (prior !== PERSISTENCE_STATE.SAVING) return show(null)
          show(createBadge({ tone: TONE.SUCCESS, label: 'Saved', dot: true }))
          fadeTimer = setTimeout(
            () => element.replaceChildren(),
            SAVED_VISIBLE_MS,
          )
          return
        default:
          return show(null)
      }
    },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Icons
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const SVG_NS = 'http://www.w3.org/2000/svg'

const createChevronDownIcon = (): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '12')
  svg.setAttribute('height', '12')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const path = document.createElementNS(SVG_NS, 'polyline')
  path.setAttribute('points', '4 6 8 10 12 6')
  svg.appendChild(path)
  return svg
}
