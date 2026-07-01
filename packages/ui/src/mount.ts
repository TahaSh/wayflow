// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

import {
  createTypedNode,
  type Field,
  ISSUE_SEVERITY,
  type ValidationWarning,
} from '@wayflow/agent'
import {
  formatDuration,
  type Graph,
  NODE_STATUS,
  pluralize,
  toSnakeCase,
} from '@wayflow/core'
import { PERSISTENCE_STATE } from '@wayflow/dom'
import { BUTTON_VARIANT, createIconButton } from './controls'
import {
  createDrawer,
  DRAWER_EDGE,
  type DrawerEdge,
  type DrawerHandle,
} from './drawer'
import {
  createHeader,
  HEADER_STATUS_TONE,
  type HeaderAction,
  RUN_STATE,
} from './header'
import {
  hasInputFields,
  hasUnmetRequiredInputs,
  openInputsModal,
  openInputsRun,
} from './inputs-modal'
import {
  type CreateInspectorPanelParams,
  createInspectorPanel,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_TABS,
  type InspectorPanelHandle,
} from './inspector-panel'
import {
  EDITOR_MODE,
  type EditorMode,
  MODE_FEATURES,
  type PreviewOptions,
} from './mode'
import { type CreateNodePaletteParams, createNodePalette } from './node-palette'
import {
  createKeyButton,
  createPreviewFooter,
  createThemeToggle,
  createZoomControl,
  type ZoomControlHandle,
} from './preview-shell'
import { INSPECTOR_SIDEBAR_MIN_WIDTH, isCompactViewport } from './responsive'
import type { RenderMarkdown, RenderResultField } from './result-panel'
import { openSettingsModal } from './settings-modal'
import { THEME } from './theme'
import { type CreateToolbarParams, createToolbar } from './toolbar'
import { INSPECTOR_WIDTH } from './ui-prefs'
import { createWorkflowContextMenu } from './workflow-context-menu'
import type { WorkflowEditor } from './workflow-editor'

const UNTITLED_WORKFLOW_TITLE = 'Untitled workflow'
const LAYOUT_SWITCH_COOLDOWN_MS = 150
const NODE_CASCADE_OFFSET = 24

export interface HeaderOptions {
  title?: string | (() => HTMLElement)
  actions?: HeaderAction[]
}

export type NodePaletteOptions = Partial<
  Pick<CreateNodePaletteParams, 'position'>
>

export type ConfigPanelOptions = Partial<
  Pick<CreateInspectorPanelParams, 'position'>
> & {
  // Starting inspector width, used only until the user resizes it.
  initialWidth?: number
}

export type ToolbarOptions = Partial<Pick<CreateToolbarParams, 'position'>>

// The editor's `ui` option: which panels show, where they sit, and the header.
export interface EditorUIOptions {
  header?: HeaderOptions | false
  nodePalette?: NodePaletteOptions | false
  configPanel?: ConfigPanelOptions | false
  toolbar?: ToolbarOptions | false
}

export type OnRunCallback = (params: {
  inputs: Record<string, unknown>
  signal: AbortSignal
}) => void | Promise<void>

// Internal mount target for a panel, set by the editor; low-level mountUI only.
interface PanelTarget {
  target?: HTMLElement
}

export interface MountUIOptions {
  header?: (HeaderOptions & PanelTarget) | false
  nodePalette?: (NodePaletteOptions & PanelTarget) | false
  configPanel?: (ConfigPanelOptions & PanelTarget) | false
  toolbar?: (ToolbarOptions & PanelTarget) | false

  // Set by the editor; selects the mode's feature set (see MODE_FEATURES).
  mode?: EditorMode
  preview?: PreviewOptions
}

// A run to drive inside the run-in-progress UI; receives the cancel signal.
export type RunSessionFn = (signal: AbortSignal) => Promise<void>

export interface MountUIHandle {
  destroy: () => void
  setAwaitingReview: (active: boolean) => void
  runSession: (fn: RunSessionFn) => Promise<void>
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const mountUI = (
  editor: WorkflowEditor,
  options: MountUIOptions,
  onRun?: OnRunCallback,
  renderResultField?: RenderResultField,
  renderMarkdown?: RenderMarkdown,
  iconFactory?: (name: string, size?: number) => SVGElement | null,
): MountUIHandle => {
  const container = editor.getContainer()
  const mode = options.mode ?? EDITOR_MODE.EDIT
  const features = MODE_FEATURES[mode]
  const destroyers: (() => void)[] = []

  destroyers.push(createWorkflowContextMenu({ editor }).destroy)

  let sharedInspector: InspectorPanelHandle | null = null
  let nodePalette: ReturnType<typeof createNodePalette> | null = null
  // Reflects a human-review pause in the header. No-op without a header.
  let setAwaitingReview: (active: boolean) => void = () => {}
  // Runs a function inside the run-in-progress UI (Cancel button + status).
  let runSessionRef: ((fn: RunSessionFn) => Promise<void>) | null = null

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Header (with optional Run button + status)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  if (options.header !== false) {
    const headerOpts = options.header ?? {}
    const headerTarget = headerOpts.target ?? container

    // Opens the Issues tab and flashes it so the move is visible even when that
    // tab was already showing. Locating a specific node is left to the issue rows.
    const revealIssues = () => {
      sharedInspector?.setActiveTab(INSPECTOR_TABS.ISSUES)
      sharedInspector?.flashTab(INSPECTOR_TABS.ISSUES)
    }

    const blockingIssues = () =>
      editor
        .getValidationWarnings()
        .filter((w) => w.severity === ISSUE_SEVERITY.ERROR)

    let blockedRunShown = false
    const showBlockedRunStatus = (count: number) => {
      header.setStatus({
        text: `Fix ${pluralize(count, 'issue')} to run`,
        tone: HEADER_STATUS_TONE.ERROR,
        onClick: revealIssues,
      })
      blockedRunShown = true
    }

    // Keep that status honest as issues change: update the count, or clear it
    // once nothing blocks the run.
    const refreshBlockedRunStatus = () => {
      if (!blockedRunShown) return
      const count = blockingIssues().length
      if (count === 0) {
        header.setStatus({ text: '' })
        blockedRunShown = false
      } else {
        showBlockedRunStatus(count)
      }
    }

    // Restores the Run button after a run; goes through the mode-aware handler.
    const startRun = () => onRunClick()

    // Drives the run-in-progress UI (Cancel button, abort signal, status) around
    // an arbitrary run function — shared by the Run button and editor re-attach.
    const runSession = async (fn: RunSessionFn) => {
      blockedRunShown = false
      const controller = new AbortController()
      header.setPrimaryAction({
        label: 'Cancel',
        icon: 'square',
        variant: BUTTON_VARIANT.DANGER,
        onClick: () => controller.abort(),
      })
      // The button label communicates the running state — don't duplicate it
      // in the status. Status only surfaces the post-run outcome.
      header.setStatus({ text: '' })
      header.setRunState(RUN_STATE.RUNNING)
      sharedInspector?.setRunning(true)
      const startedAt = Date.now()
      const completedCount = () =>
        Object.values(editor.getResults()).filter(
          (entry) => entry.status === NODE_STATUS.COMPLETE,
        ).length
      // Cancelling while paused resolves the run gracefully (no throw), so the
      // aborted signal — not an exception — is what marks a cancellation.
      const showCancelled = () => {
        header.setRunState(RUN_STATE.IDLE)
        header.setStatus({
          text: `Cancelled · ${formatDuration(Date.now() - startedAt)} · ${pluralize(completedCount(), 'node')} completed`,
        })
      }
      try {
        await fn(controller.signal)
        if (controller.signal.aborted) {
          showCancelled()
        } else {
          header.setRunState(RUN_STATE.DONE)
          header.setStatus({
            text: `Completed · ${formatDuration(Date.now() - startedAt)} · ${pluralize(completedCount(), 'node')}`,
            tone: HEADER_STATUS_TONE.SUCCESS,
          })
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          showCancelled()
        } else {
          header.setRunState(RUN_STATE.ERROR)
          const msg = err instanceof Error ? err.message : String(err)
          const failed = Object.entries(editor.getResults()).filter(
            ([, entry]) => entry.status === NODE_STATUS.ERROR,
          )
          if (failed.length > 0) {
            const firstFailedId = failed[0][0]
            header.setStatus({
              text: `Failed · ${pluralize(failed.length, 'error')}`,
              tone: HEADER_STATUS_TONE.ERROR,
              onClick: () => {
                editor.selectNodes([firstFailedId])
                sharedInspector?.setActiveTab(INSPECTOR_TABS.RESULT)
              },
            })
          } else {
            header.setStatus({
              text: `Failed: ${msg}`,
              tone: HEADER_STATUS_TONE.ERROR,
            })
          }
        }
      } finally {
        header.setPrimaryAction({
          label: 'Run',
          icon: 'play',
          variant: BUTTON_VARIANT.PRIMARY,
          onClick: startRun,
        })
        sharedInspector?.setRunning(false)
        sharedInspector?.setActiveTab(INSPECTOR_TABS.RESULT)
      }
    }
    runSessionRef = runSession

    // The run uses the graph's Input defaults, which the Config tab and the
    // test-inputs modal both edit.
    const dispatchRun = async (inputs: Record<string, unknown> = {}) => {
      if (!onRun) return
      if (features.gateRun) {
        const blocking = blockingIssues()
        if (blocking.length > 0) {
          showBlockedRunStatus(blocking.length)
          revealIssues()
          return
        }
      }
      await runSession(async (signal) => {
        await onRun({ inputs, signal })
      })
    }

    // Persist the entered values as the Input fields' defaults, so they survive
    // a reload (via graph autosave) and seed the next run.
    const applyInputDefaults = (values: Record<string, unknown>) => {
      for (const node of Object.values(editor.getGraph().nodes)) {
        if (node.type !== 'input') continue
        const fields = node.data.fields as Field[] | undefined
        if (!Array.isArray(fields)) continue
        const nextFields = fields.map((f) =>
          f.name in values ? { ...f, default: values[f.name] } : f,
        )
        editor.updateNodeConfig(node.id, { fields: nextFields })
      }
    }

    const openSetInputsModal = () => {
      openInputsModal({
        graph: editor.getGraph(),
        anchor: container,
        onSave: applyInputDefaults,
        onSaveAndRun: (values) => {
          applyInputDefaults(values)
          void dispatchRun()
        },
      })
    }

    // Non-editing flow: collect inputs and run with them, never persisting to
    // the locked graph.
    const collectInputsAndRun = () => {
      openInputsRun({
        graph: editor.getGraph(),
        anchor: container,
        onRun: (values) => void dispatchRun(values),
      })
    }

    const openInputsFlow = () =>
      features.inputs === 'persist'
        ? openSetInputsModal()
        : collectInputsAndRun()

    // Without a dropdown (mobile, or preview) Run is the entry to test inputs;
    // otherwise it runs the graph's current defaults.
    const onRunClick = () => {
      const graph = editor.getGraph()
      const collectOnRun = isCompactViewport() || !features.runMenu
      if (
        hasInputFields(graph) &&
        (collectOnRun || hasUnmetRequiredInputs(graph))
      ) {
        openInputsFlow()
        return
      }
      void dispatchRun()
    }

    // The dropdown is desktop-only — mobile folds "set test inputs" into Run.
    const runMenuItems =
      features.runMenu && !isCompactViewport()
        ? [{ label: 'Set test inputs…', onClick: openInputsFlow }]
        : undefined

    const openSettings = () => {
      openSettingsModal({
        metadata: editor.getMetadata(),
        anchor: container,
        onSave: (next) => editor.setMetadata(next),
      })
    }

    const exportWorkflow = () => {
      const json = editor.export()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${toSnakeCase(editor.getMetadata().name) ?? 'workflow'}.json`
      a.click()
      URL.revokeObjectURL(url)
    }

    const importWorkflow = () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        editor.import(text)
      })
      input.click()
    }

    // Preview hosts zoom (and an optional key button) in the header rather than
    // the floating toolbar, for a self-contained embeddable shell.
    let previewZoom: ZoomControlHandle | undefined
    const actionElements: HTMLElement[] = []
    if (features.headerZoom) {
      if (options.preview?.zoom !== false) {
        previewZoom = createZoomControl({
          initialZoom: editor.getViewport().zoom,
          onZoomIn: () => editor.zoomIn(),
          onZoomOut: () => editor.zoomOut(),
          onFitView: () => editor.fitView(),
        })
        actionElements.push(previewZoom.element)
        editor.on('viewportChange', ({ viewport }) =>
          previewZoom?.setZoom(viewport.zoom),
        )
      }
      if (options.preview?.themeToggle) {
        const shell = container.closest('.wf-shell')
        actionElements.push(
          createThemeToggle({
            getResolvedTheme: () =>
              shell?.getAttribute('data-theme') === THEME.LIGHT
                ? THEME.LIGHT
                : THEME.DARK,
            onToggle: (next) => editor.setTheme(next),
          }),
        )
      }
      const keyButton = options.preview?.keyButton
      if (keyButton) {
        actionElements.push(
          createKeyButton({ ...keyButton, anchor: container }),
        )
      }
    }

    const header = createHeader({
      target: headerTarget,
      title: headerOpts.title,
      actions: headerOpts.actions,
      actionElements,
      showRunState: features.statusDot,
      titleMenu: features.titleMenu
        ? [
            { label: 'Workflow settings…', onClick: openSettings },
            { label: 'Export workflow…', onClick: exportWorkflow },
            { label: 'Import workflow…', onClick: importWorkflow },
          ]
        : undefined,
      primaryAction: onRun
        ? {
            label: 'Run',
            icon: 'play',
            onClick: onRunClick,
            menuItems: runMenuItems,
          }
        : undefined,
    })

    setAwaitingReview = (active: boolean) => {
      header.setStatus(active ? { text: 'Waiting for review' } : { text: '' })
    }

    const renderTitle = () => {
      const name = editor.getMetadata().name
      header.setTitle(name?.trim() ? name : UNTITLED_WORKFLOW_TITLE)
    }
    renderTitle()
    editor.on('metadataChange', renderTitle)

    const renderIssuesBadge = (warnings: ValidationWarning[]) => {
      header.setIssues({ count: warnings.length, onClick: revealIssues })
    }
    renderIssuesBadge(editor.getValidationWarnings())
    editor.onValidationUpdate((warnings) => {
      renderIssuesBadge(warnings)
      refreshBlockedRunStatus()
    })

    if (editor.getPersistenceState() !== null) {
      const renderSaveStatus = () => {
        header.setSaveStatus({
          state: editor.getPersistenceState(),
          onRetry: () => void editor.save(),
        })
      }
      const renderTitleLoading = () => {
        header.setTitleLoading(
          editor.getPersistenceState() === PERSISTENCE_STATE.LOADING,
        )
      }
      renderSaveStatus()
      renderTitleLoading()
      editor.on('persistenceStateChange', () => {
        renderSaveStatus()
        renderTitleLoading()
      })
    }

    destroyers.push(header.destroy)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Footer (preview)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  if (features.footer && options.preview?.footer !== false) {
    const footer = createPreviewFooter(options.preview?.footer ?? {})
    // The shell (a flex column with the header) is the footer's home — the
    // editor container is just the canvas.
    const shellRoot = container.closest('.wf-shell') ?? container
    shellRoot.appendChild(footer)
    destroyers.push(() => footer.remove())
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Loading mask
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  // Covers the canvas and dims the UI until the persisted snapshot resolves, so
  // a stored graph never flashes the seed first and nothing can be edited
  // mid-load.
  if (editor.getPersistenceState() !== null) {
    const shellRoot = container.closest('.wf-shell')
    const overlay = createLoadingOverlay()
    container.appendChild(overlay)
    const syncLoading = () => {
      const loading = editor.getPersistenceState() === PERSISTENCE_STATE.LOADING
      overlay.hidden = !loading
      shellRoot?.classList.toggle('wf-loading', loading)
    }
    syncLoading()
    editor.on('persistenceStateChange', syncLoading)
    destroyers.push(() => {
      overlay.remove()
      shellRoot?.classList.remove('wf-loading')
    })
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Node palette
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  if (options.nodePalette !== false) {
    const nodePaletteOptions = options.nodePalette ?? {}
    const registry = editor.getRegisteredNodeTypes()

    // A `unique` type can't be added again once one is in the graph. Track the
    // placed types from the live change payload so this never clones the graph.
    let placedTypes = new Set<string>()
    const disabledReason = (type: string): string | null => {
      const model = editor.getModelAvailability(type)
      if (model && !model.available) return model.reason ?? null
      if (registry[type]?.unique && placedTypes.has(type))
        return `Only one ${registry[type].label} node allowed`
      return null
    }

    const palette = createNodePalette({
      container,
      nodeTypes: registry,
      position: nodePaletteOptions.position,
      target: nodePaletteOptions.target,
      iconFactory,
      disabledReason,
      getZoom: () => editor.getViewport().zoom,
      onDrop: (type, screenPosition) => {
        if (disabledReason(type)) return
        let position = editor.screenToCanvas(screenPosition.x, screenPosition.y)
        // Center taps all target the same point — nudge past a node already
        // there so they cascade instead of stacking.
        const placed = Object.values(editor.getGraph().nodes).map(
          (n) => n.position,
        )
        while (
          placed.some(
            (p) =>
              Math.abs(p.x - position.x) < NODE_CASCADE_OFFSET &&
              Math.abs(p.y - position.y) < NODE_CASCADE_OFFSET,
          )
        ) {
          position = {
            x: position.x + NODE_CASCADE_OFFSET,
            y: position.y + NODE_CASCADE_OFFSET,
          }
        }
        const node = createTypedNode({
          type,
          registry,
          portTypes: editor.getRegisteredPortTypes(),
          position,
        })

        editor.addNode(node)
      },
    })
    nodePalette = palette

    const syncPalette = (graph: Graph) => {
      placedTypes = new Set(Object.values(graph.nodes).map((n) => n.type))
      palette.refresh()
    }
    syncPalette(editor.getGraph())
    editor.on('change', syncPalette)
    destroyers.push(editor.onModelsChange(() => palette.refresh()))
    destroyers.push(palette.destroy)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Config Panel
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  if (options.configPanel !== false && features.inspector !== 'none') {
    const configPanelOptions = options.configPanel ?? {}
    const configPanelHome = configPanelOptions.target ?? container

    if (
      configPanelOptions.initialWidth !== undefined &&
      !INSPECTOR_WIDTH.has()
    ) {
      const { initialWidth } = configPanelOptions
      INSPECTOR_WIDTH.set(
        Math.max(
          INSPECTOR_MIN_WIDTH,
          Math.min(INSPECTOR_MAX_WIDTH, initialWidth),
        ),
      )
    }
    const inspectorPanel = createInspectorPanel({
      container,
      position: configPanelOptions.position,
      target: configPanelHome,
      readOnly: !features.editable,
      includeIssues: features.editable,
      // Preview leads with the run output; the prompts are secondary.
      defaultTab:
        features.inspector === 'overlay'
          ? INSPECTOR_TABS.RESULT
          : INSPECTOR_TABS.CONFIG,
      renderResultField,
      renderMarkdown,
      portTypes: editor.getRegisteredPortTypes(),
      toolCatalog: editor.getRegisteredTools(),
      onConfigChange: ({ nodeId, key, newValue }) => {
        editor.updateNodeConfig(nodeId, { [key]: newValue })
        const node = editor.getGraph().nodes[nodeId]
        if (node) inspectorPanel.refresh(node.data)
      },
      onRenameField: (nodeId, configKey, oldName, newName) =>
        editor.renameField(nodeId, configKey, oldName, newName),
      onNameCommit: (nodeId, name) => editor.setNodeName(nodeId, name),
    })
    sharedInspector = inspectorPanel

    // Node actions ride in the sheet's draggable header (mobile only); the docked
    // panel and right drawer rely on the keyboard and context menu.
    const sheetHeaderActions = features.editable
      ? (() => {
          const duplicate = createIconButton({
            icon: 'copy',
            label: 'Duplicate',
            onClick: () => editor.duplicateSelection(),
          })
          const del = createIconButton({
            icon: 'trash',
            label: 'Delete',
            onClick: () => editor.deleteSelection(),
          })
          del.classList.add('wf-icon-button-danger')
          return [duplicate, del]
        })()
      : undefined

    const getSelectedNodeId = (): string | undefined => {
      const ids = [...editor.getSelection().nodeIds]
      return ids.length === 1 ? ids[0] : undefined
    }

    // The inspector docks as a side panel when there's room, and slides in from
    // an edge on selection when there isn't: always for the overlay modes, and
    // whenever the editor is too narrow for a side panel. Re-checked on resize,
    // so a tight embed adapts to its own width, not just the window's.
    const alwaysDrawer = features.inspector === 'overlay'
    let inspectorDrawer: DrawerHandle | undefined
    let drawerEdge: DrawerEdge | undefined
    let docked = true

    const drawerEdgeNow = (): DrawerEdge =>
      isCompactViewport() ? DRAWER_EDGE.BOTTOM : DRAWER_EDGE.RIGHT

    const ensureDrawer = (edge: DrawerEdge): DrawerHandle => {
      if (inspectorDrawer && drawerEdge !== edge) {
        inspectorDrawer.destroy()
        inspectorDrawer = undefined
      }
      if (inspectorDrawer) {
        inspectorDrawer.setContent(inspectorPanel.element)
      } else {
        drawerEdge = edge
        inspectorDrawer = createDrawer({
          edge,
          content: inspectorPanel.element,
          anchor: container,
          backdrop: false,
          sheet: edge === DRAWER_EDGE.BOTTOM,
          headerActions: sheetHeaderActions,
          resize: {
            getWidth: () => INSPECTOR_WIDTH.get(),
            commit: (width) => INSPECTOR_WIDTH.set(width),
            min: INSPECTOR_MIN_WIDTH,
            max: INSPECTOR_MAX_WIDTH,
          },
        })
      }
      return inspectorDrawer
    }

    // Two guards stop the layouts flip-flopping at a width where docking and
    // undocking the panel each nudge the measured width back across the seam:
    // restoring the panel needs more width than collapsing it, and a switch that
    // would just return to the width we last switched at is ignored.
    let lastSwitchAt = Number.NEGATIVE_INFINITY

    const applyPlacement = (): void => {
      const width = container.getBoundingClientRect().width
      const useDrawer =
        alwaysDrawer ||
        isCompactViewport() ||
        width < INSPECTOR_SIDEBAR_MIN_WIDTH + (docked ? 0 : 80)

      const settled =
        useDrawer === !docked && (!useDrawer || drawerEdge === drawerEdgeNow())
      if (settled) return
      // Skip a switch right after the previous one: a placement change can nudge
      // our own measured width and ping-pong. Real resizes are far apart.
      const now = performance.now()
      if (now - lastSwitchAt < LAYOUT_SWITCH_COOLDOWN_MS) return
      lastSwitchAt = now

      if (useDrawer) {
        inspectorPanel.setFill(true)
        const drawer = ensureDrawer(drawerEdgeNow())
        docked = false
        if (getSelectedNodeId()) drawer.open()
      } else {
        inspectorDrawer?.close()
        inspectorPanel.setFill(false)
        configPanelHome.appendChild(inspectorPanel.element)
        docked = true
      }
      nodePalette?.setCompact(!docked)
    }

    const openInspectorDrawer = () => {
      if (!docked) inspectorDrawer?.open()
    }
    const closeInspectorDrawer = () => inspectorDrawer?.close()

    // Re-place only once the width holds steady for a frame, so the panel never
    // switches mid-resize (which would flicker while dragging).
    let placementFrame = 0
    let steadyWidth = Number.NaN
    const checkPlacement = () => {
      const width = container.getBoundingClientRect().width
      if (width !== steadyWidth) {
        steadyWidth = width
        placementFrame = requestAnimationFrame(checkPlacement)
        return
      }
      placementFrame = 0
      applyPlacement()
    }

    const inspectorResize = new ResizeObserver(() => {
      if (!placementFrame)
        placementFrame = requestAnimationFrame(checkPlacement)
    })
    inspectorResize.observe(container)
    applyPlacement()
    destroyers.push(() => {
      if (placementFrame) cancelAnimationFrame(placementFrame)
      inspectorResize.disconnect()
      inspectorDrawer?.destroy()
    })

    const refreshResultForSelection = () => {
      const results = editor.getResults()
      const hasAnyRunData = Object.keys(results).length > 0
      const nodeId = getSelectedNodeId()
      const node = nodeId ? editor.getGraph().nodes[nodeId] : undefined
      inspectorPanel.showResult({
        entry: nodeId ? results[nodeId] : undefined,
        nodeId,
        nodeType: node?.type,
        nodeConfig: node?.data,
        hasAnyRunData,
      })
    }

    const showForSelection = (selection: { nodeIds: Set<string> }) => {
      const selectedNodeIds = [...selection.nodeIds]
      if (selectedNodeIds.length === 1) {
        const nodeId = selectedNodeIds[0]
        const node = editor.getGraph().nodes[nodeId]
        if (node?.type) {
          const definition = editor.getNodeTypeDefinition(node.type)!
          inspectorPanel.show({
            nodeId,
            definition,
            config: node.data ?? {},
            name: node.name,
          })
          refreshResultForSelection()
          openInspectorDrawer()
          return
        }
      }
      inspectorPanel.hide()
      closeInspectorDrawer()
    }

    editor.on('selectionChange', showForSelection)
    editor.on('nodeDragStart', () => inspectorDrawer?.collapse())
    destroyers.push(
      editor.onModelsChange(() => showForSelection(editor.getSelection())),
    )

    editor.on('nameChange', ({ nodeId }) => {
      const selection = editor.getSelection()
      if (selection.nodeIds.size !== 1 || !selection.nodeIds.has(nodeId)) return
      const node = editor.getGraph().nodes[nodeId]
      if (!node) return
      const definition = editor.getNodeTypeDefinition(node.type)
      if (!definition) return
      inspectorPanel.show({
        nodeId,
        definition,
        config: node.data ?? {},
        name: node.name,
      })
    })

    // Run-data updates fire many times a second; skip ones for nodes we aren't
    // showing, and patch (not rebuild) the one we are.
    editor.onResultsUpdate((results, changedNodeId) => {
      if (changedNodeId === undefined) {
        refreshResultForSelection()
        return
      }
      if (changedNodeId !== getSelectedNodeId()) return
      inspectorPanel.updateResultEntry(results[changedNodeId])
    })

    // Design-time issues are an authoring concern — the non-editing modes drop
    // the tab and skip the wiring entirely.
    if (features.editable) {
      let locatingNodeId: string | null = null
      const renderIssues = (warnings: ValidationWarning[]) => {
        const graph = editor.getGraph()
        inspectorPanel.showIssues({
          warnings,
          nodeLabel: (nodeId) => {
            const node = graph.nodes[nodeId]
            if (!node) return nodeId
            if (node.name?.trim()) return node.name
            return editor.getNodeTypeDefinition(node.type)?.label ?? node.type
          },
          onSelect: (nodeId) => {
            editor.selectNodes([nodeId])
            editor.focusNode(nodeId)
          },
          onHover: (nodeId) => {
            if (locatingNodeId) editor.setNodeLocating(locatingNodeId, false)
            locatingNodeId = nodeId
            if (nodeId) editor.setNodeLocating(nodeId, true)
          },
        })
      }
      renderIssues(editor.getValidationWarnings())
      editor.onValidationUpdate(renderIssues)
    }

    destroyers.push(inspectorPanel.destroy)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Toolbar
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  if (options.toolbar !== false && features.toolbar !== 'none') {
    const toolbarOptions = options.toolbar ?? {}
    const withHistory = features.toolbar === 'full'
    const toolbar = createToolbar({
      container,
      position: toolbarOptions.position,
      target: toolbarOptions.target,
      initialZoom: editor.getViewport().zoom,
      onZoomIn: () => editor.zoomIn(),
      onZoomOut: () => editor.zoomOut(),
      onZoomTo: (zoom) => editor.setViewport({ zoom }),
      onFitView: () => editor.fitView(),
      onUndo: () => editor.undo(),
      onRedo: () => editor.redo(),
      history: withHistory,
    })

    editor.on('viewportChange', ({ viewport }) =>
      toolbar.setZoom(viewport.zoom),
    )

    if (withHistory) {
      const refreshHistoryState = () => {
        toolbar.setUndoEnabled(editor.canUndo())
        toolbar.setRedoEnabled(editor.canRedo())
      }
      refreshHistoryState()
      editor.on('change', refreshHistoryState)
    }

    destroyers.push(toolbar.destroy)
  }

  return {
    destroy: () => destroyers.forEach((fn) => fn()),
    setAwaitingReview,
    runSession: (fn) =>
      runSessionRef ? runSessionRef(fn) : fn(new AbortController().signal),
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createLoadingOverlay = (): HTMLElement => {
  const overlay = document.createElement('div')
  overlay.classList.add('wf-shell-loading')

  const progress = document.createElement('div')
  progress.classList.add('wf-shell-loading-progress')

  const content = document.createElement('div')
  content.classList.add('wf-shell-loading-content')

  const ring = document.createElement('span')
  ring.classList.add('wf-shell-loading-ring')

  const title = document.createElement('div')
  title.classList.add('wf-shell-loading-title')
  title.textContent = 'Loading workflow…'

  const sub = document.createElement('div')
  sub.classList.add('wf-shell-loading-sub')
  sub.textContent = 'Fetching nodes and connections'

  content.append(ring, title, sub)
  overlay.append(progress, content)
  return overlay
}
