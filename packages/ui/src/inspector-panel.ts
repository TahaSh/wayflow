import type { RunDataEntry, ValidationWarning } from '@wayflow/agent'
import {
  type ConfigPanelHandle,
  type CreateConfigPanelParams,
  createConfigPanel,
} from './config-panel'
import { createAlert, TONE } from './controls'
import { flashAttention } from './effects'
import { createWidthResizeHandle } from './resize'
import {
  createResultPanel,
  type RenderMarkdown,
  type RenderResultField,
} from './result-panel'
import { INSPECTOR_WIDTH } from './ui-prefs'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const INSPECTOR_MIN_WIDTH = 280
export const INSPECTOR_MAX_WIDTH = 640

const clampWidth = (width: number): number =>
  Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, width))

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const INSPECTOR_TABS = {
  CONFIG: 'config',
  RESULT: 'result',
  ISSUES: 'issues',
} as const

export type TabId = (typeof INSPECTOR_TABS)[keyof typeof INSPECTOR_TABS]

interface TabDef {
  id: TabId
  label: string
  body: HTMLElement
}

// Forwards createConfigPanel's params through, plus the result render hook.
export interface CreateInspectorPanelParams extends CreateConfigPanelParams {
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  // Include the design-time Issues tab. Off for the non-editing modes.
  includeIssues?: boolean
  // Fill the container instead of being a fixed-width, resizable side-card —
  // used when the panel rides in a drawer on small screens.
  fill?: boolean
  // Which tab opens first (default Config). Preview opens on Result, where the
  // run output — not the prompts — is what matters.
  defaultTab?: TabId
}

export interface ShowResultParams {
  entry: RunDataEntry | undefined
  nodeId?: string
  nodeType?: string
  nodeConfig?: Record<string, unknown>
  hasAnyRunData: boolean
}

export interface ShowIssuesParams {
  warnings: ValidationWarning[]
  nodeLabel: (nodeId: string) => string
  onSelect: (nodeId: string) => void
  onHover: (nodeId: string | null) => void
}

export interface InspectorPanelHandle {
  element: HTMLElement
  show: ConfigPanelHandle['show']
  refresh: ConfigPanelHandle['refresh']
  hide: ConfigPanelHandle['hide']
  showResult: (params: ShowResultParams) => void
  // Patch the shown node's entry in place (vs showResult's full render).
  updateResultEntry: (entry: RunDataEntry) => void
  showIssues: (params: ShowIssuesParams) => void
  setRunning: (running: boolean) => void
  setActiveTab: (id: TabId) => void
  flashTab: (id: TabId) => void
  // Fill the container (true) or keep a fixed width (false).
  setFill: (fill: boolean) => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Empty State Copy
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const RESULT_NO_RUNS_TEXT = 'No runs yet. Click Run to execute.'

const RESULT_PICK_NODE_TEXT = 'Select a node to view its run details.'

const RESULT_RUNNING_TEXT = 'Running…'

const ISSUES_NONE_TEXT = 'No issues found.'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Panel Root
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface PanelRootProps {
  position: 'left' | 'right'
  fill: boolean
}

const createPanelRoot = ({
  position,
  fill,
}: PanelRootProps): HTMLDivElement => {
  const panel = document.createElement('div')
  panel.classList.add('wf-inspector-panel', `wf-inspector-panel-${position}`)
  if (fill) panel.classList.add('wf-inspector-panel-fill')
  else panel.style.flex = `0 0 ${clampWidth(INSPECTOR_WIDTH.get())}px`
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  return panel
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Body Slot
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface BodyProps {
  variant: 'config' | 'result' | 'issues'
}

const createBody = ({ variant }: BodyProps): HTMLDivElement => {
  const body = document.createElement('div')
  body.classList.add('wf-inspector-body', `wf-inspector-body-${variant}`)
  return body
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Empty State
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface EmptyStateProps {
  text: string
}

const createEmptyState = ({ text }: EmptyStateProps): HTMLDivElement => {
  const empty = document.createElement('div')
  empty.classList.add('wf-inspector-empty')
  empty.textContent = text
  return empty
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Issue Groups
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const GRAPH_GROUP_LABEL = 'Workflow'

interface IssueGroup {
  nodeId?: string
  label: string
  warnings: ValidationWarning[]
}

const groupWarnings = (
  warnings: ValidationWarning[],
  nodeLabel: (nodeId: string) => string,
): IssueGroup[] => {
  const graphLevel: ValidationWarning[] = []
  const byNode = new Map<string, ValidationWarning[]>()
  for (const warning of warnings) {
    const nodeIds = warning.nodeIds ?? []
    if (nodeIds.length === 1) {
      const list = byNode.get(nodeIds[0]) ?? []
      list.push(warning)
      byNode.set(nodeIds[0], list)
    } else {
      graphLevel.push(warning)
    }
  }
  const groups: IssueGroup[] = []
  if (graphLevel.length > 0) {
    groups.push({ label: GRAPH_GROUP_LABEL, warnings: graphLevel })
  }
  for (const [nodeId, list] of byNode) {
    groups.push({ nodeId, label: nodeLabel(nodeId), warnings: list })
  }
  return groups
}

interface IssueGroupProps {
  group: IssueGroup
  onSelect: (nodeId: string) => void
  onHover: (nodeId: string | null) => void
}

const createIssueGroup = ({
  group,
  onSelect,
  onHover,
}: IssueGroupProps): HTMLElement => {
  const groupEl = document.createElement('div')
  groupEl.classList.add('wf-inspector-issue-group')

  const header = document.createElement('div')
  header.classList.add('wf-inspector-issue-group-header')
  header.textContent = group.label
  groupEl.appendChild(header)

  for (const warning of group.warnings) {
    groupEl.appendChild(
      createAlert({
        tone: TONE.WARNING,
        text: warning.message,
        hint: warning.hint,
        docsUrl: warning.docsUrl,
        code: warning.code,
      }),
    )
  }

  const { nodeId } = group
  if (nodeId !== undefined) {
    groupEl.classList.add('wf-inspector-issue-group-clickable')
    groupEl.addEventListener('click', () => onSelect(nodeId))
    groupEl.addEventListener('mouseenter', () => onHover(nodeId))
    groupEl.addEventListener('mouseleave', () => onHover(null))
  }

  return groupEl
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Tab Strip
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createTabStrip = (): HTMLDivElement => {
  const strip = document.createElement('div')
  strip.classList.add('wf-inspector-tabs')
  strip.setAttribute('role', 'tablist')
  return strip
}

interface TabButtonProps {
  id: TabId
  label: string
  onClick: () => void
}

const createTabButton = ({
  id,
  label,
  onClick,
}: TabButtonProps): HTMLButtonElement => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('wf-inspector-tab')
  btn.dataset.tabId = id
  btn.setAttribute('role', 'tab')
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createInspectorPanel = (
  params: CreateInspectorPanelParams,
): InspectorPanelHandle => {
  const {
    container,
    position = 'right',
    target,
    includeIssues = true,
    fill = false,
    defaultTab = INSPECTOR_TABS.CONFIG,
  } = params

  const panel = createPanelRoot({ position, fill })

  const configBody = createBody({ variant: 'config' })
  const resultBody = createBody({ variant: 'result' })
  const resultEmpty = createEmptyState({ text: RESULT_NO_RUNS_TEXT })
  const resultRunning = createEmptyState({ text: RESULT_RUNNING_TEXT })
  resultBody.appendChild(resultEmpty)
  resultBody.appendChild(resultRunning)

  const issuesBody = createBody({ variant: 'issues' })
  const issuesEmpty = createEmptyState({ text: ISSUES_NONE_TEXT })
  const issuesList = document.createElement('div')
  issuesList.classList.add('wf-inspector-issues-list')
  issuesBody.append(issuesEmpty, issuesList)

  const tabs: TabDef[] = [
    { id: INSPECTOR_TABS.CONFIG, label: 'Config', body: configBody },
    { id: INSPECTOR_TABS.RESULT, label: 'Result', body: resultBody },
    ...(includeIssues
      ? [{ id: INSPECTOR_TABS.ISSUES, label: 'Issues', body: issuesBody }]
      : []),
  ]

  const tabStrip = createTabStrip()
  const buttons = new Map<TabId, HTMLButtonElement>()
  for (const tab of tabs) {
    const btn = createTabButton({
      id: tab.id,
      label: tab.label,
      onClick: () => setActiveTab(tab.id),
    })
    buttons.set(tab.id, btn)
    tabStrip.appendChild(btn)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Tab Switching
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const setActiveTab = (id: TabId) => {
    for (const tab of tabs) {
      const isActive = tab.id === id
      tab.body.style.display = isActive ? '' : 'none'
      const btn = buttons.get(tab.id)
      if (!btn) continue
      btn.classList.toggle('wf-inspector-tab-active', isActive)
      btn.setAttribute('aria-selected', String(isActive))
    }
  }

  const flashTab = (id: TabId) => {
    const btn = buttons.get(id)
    if (btn) flashAttention(btn)
  }

  panel.appendChild(
    createWidthResizeHandle({
      side: position,
      min: INSPECTOR_MIN_WIDTH,
      max: INSPECTOR_MAX_WIDTH,
      getWidth: () => clampWidth(INSPECTOR_WIDTH.get()),
      apply: (width) => {
        panel.style.flex = `0 0 ${width}px`
      },
      commit: (width) => INSPECTOR_WIDTH.set(width),
    }),
  )
  panel.appendChild(tabStrip)
  panel.appendChild(configBody)
  panel.appendChild(resultBody)
  if (includeIssues) panel.appendChild(issuesBody)
  setActiveTab(defaultTab)

  const mountTarget = target ?? container
  mountTarget.appendChild(panel)

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Config panel (mounted into the config tab body)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const configPanel = createConfigPanel({
    ...params,
    target: configBody,
  })

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Result panel (mounted into the result tab body)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const resultPanel = createResultPanel({
    container: resultBody,
    renderResultField: params.renderResultField,
    renderMarkdown: params.renderMarkdown,
    // The format switch persists to node config — drop it when read-only.
    onConfigChange: params.readOnly ? undefined : params.onConfigChange,
  })
  resultPanel.element.style.display = 'none'
  resultRunning.style.display = 'none'

  let lastEntry: RunDataEntry | undefined
  let lastNodeId: string | undefined
  let lastNodeType: string | undefined
  let lastNodeConfig: Record<string, unknown> | undefined
  let hasAnyRunData = false
  let isRunning = false

  const renderResult = () => {
    if (lastEntry) {
      resultEmpty.style.display = 'none'
      resultRunning.style.display = 'none'
      resultPanel.element.style.display = ''
      resultPanel.show({
        entry: lastEntry,
        nodeId: lastNodeId,
        nodeType: lastNodeType,
        nodeConfig: lastNodeConfig,
      })
      return
    }
    resultPanel.element.style.display = 'none'
    if (isRunning) {
      resultEmpty.style.display = 'none'
      resultRunning.style.display = ''
      return
    }
    resultRunning.style.display = 'none'
    resultEmpty.textContent = hasAnyRunData
      ? RESULT_PICK_NODE_TEXT
      : RESULT_NO_RUNS_TEXT
    resultEmpty.style.display = ''
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Show / Hide / Destroy
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const show: ConfigPanelHandle['show'] = (showParams) => {
    configPanel.show(showParams)
  }

  const refresh: ConfigPanelHandle['refresh'] = (config) => {
    configPanel.refresh(config)
  }

  const showResult = ({
    entry,
    nodeId,
    nodeType,
    nodeConfig,
    hasAnyRunData: hasData,
  }: ShowResultParams) => {
    lastEntry = entry
    lastNodeId = nodeId
    lastNodeType = nodeType
    lastNodeConfig = nodeConfig
    hasAnyRunData = hasData
    renderResult()
  }

  const updateResultEntry = (entry: RunDataEntry) => {
    lastEntry = entry
    hasAnyRunData = true
    renderResult()
  }

  const showIssues = ({
    warnings,
    nodeLabel,
    onSelect,
    onHover,
  }: ShowIssuesParams) => {
    issuesList.replaceChildren()
    issuesEmpty.style.display = warnings.length === 0 ? '' : 'none'
    for (const group of groupWarnings(warnings, nodeLabel)) {
      issuesList.appendChild(createIssueGroup({ group, onSelect, onHover }))
    }
  }

  const setRunning = (running: boolean) => {
    isRunning = running
    renderResult()
  }

  const hide = () => {
    configPanel.hide()
    showResult({ entry: undefined, hasAnyRunData })
  }

  const setFill = (fill: boolean) => {
    panel.classList.toggle('wf-inspector-panel-fill', fill)
    panel.style.flex = fill ? '' : `0 0 ${clampWidth(INSPECTOR_WIDTH.get())}px`
  }

  const destroy = () => {
    configPanel.destroy()
    resultPanel.destroy()
    panel.remove()
  }

  return {
    element: panel,
    show,
    refresh,
    hide,
    showResult,
    updateResultEntry,
    showIssues,
    setRunning,
    setActiveTab,
    flashTab,
    setFill,
    destroy,
  }
}
