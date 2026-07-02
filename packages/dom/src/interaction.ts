import {
  boundsIntersect,
  type CustomValidator,
  connectionValidator,
  createEdge,
  deselectAll,
  type Edge,
  findPortAtPosition,
  type Graph,
  getConnectedEdges,
  getPortPosition,
  type History,
  type Node,
  nextZIndex,
  nodeBounds,
  PORT_SIDE,
  type Port,
  pushState,
  type Selection,
  screenToCanvas,
  selectEdge,
  selectNode,
  toggleEdge,
  toggleNode,
  type Viewport,
  zoomAtPoint,
  zoomByFactor,
} from '@wayflow/core'
import {
  applySelectionStyles,
  applyViewport,
  createPendingEdge,
  createSelectionRect,
  edgePath,
  removeEdgeElement,
  renderEdge,
  setEdgeHidden,
  updateEdgePath,
  updateNode,
  updateNodeTransform,
} from './renderer'

export interface SetupInteractionParams {
  container: HTMLElement
  graph: Graph
  selection: Selection
  viewport: Viewport
  history: History
  onUpdate?: () => void
  onSelectionChange?: () => void
  onEdgeAdded?: (edge: Edge) => void
  onEdgeRemoved?: (edge: Edge) => void
  onUndo?: () => void
  onRedo?: () => void
  onCopy?: () => void
  onPaste?: (opts?: { atCanvas?: { x: number; y: number } }) => void
  onCut?: () => void
  onDuplicate?: () => void
  onSelectAll?: () => void
  onDelete?: () => void
  onNodeDragStart?: () => void
  onNodeDragEnd?: () => void
  onContextMenu?: (payload: {
    nodeId?: string
    canvas: { x: number; y: number }
    client: { x: number; y: number }
  }) => void
  onNameCommit?: (nodeId: string, name: string) => void
  onZoomEnd?: () => void
  // Re-run virtualization after a viewport change, restoring imperative state
  // on any node elements it re-creates.
  onVirtualize: () => void
  customValidator?: CustomValidator
  isInScope: (target: EventTarget | null) => boolean
  // When true, structural editing is disabled; pan/zoom/selection stay live.
  readOnly?: boolean
}

export const setupInteractions = ({
  container,
  graph,
  selection,
  viewport,
  history,
  onUpdate,
  onSelectionChange,
  onEdgeAdded,
  onEdgeRemoved,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onCut,
  onDuplicate,
  onSelectAll,
  onDelete,
  onNodeDragStart,
  onNodeDragEnd,
  onContextMenu,
  onNameCommit,
  onZoomEnd,
  onVirtualize,
  customValidator,
  isInScope,
  readOnly = false,
}: SetupInteractionParams) => {
  const getCanvasRoot = () =>
    container.querySelector('.wf-canvas-root') as HTMLElement
  const getEdgeTransformGroup = () =>
    container.querySelector('.wf-edge-transform') as SVGGElement

  let startX: number
  let startY: number

  let draggingNode: Node
  let nodeDragStarted = false

  let sourceNode: Node
  let sourcePort: Port

  let pendingEdge: SVGPathElement
  let reconnectingEdgeId: string | null = null
  let selectionRectEl: HTMLElement | null = null

  let hoveredPortEl: HTMLElement | null = null

  // This is to detect if the user dragged for panning.
  // We need this to deselect all nodes on pointer up in case the user didn't drag.
  let shouldDeselectOnPointerUp = false

  let preBoxSelection: Set<string>

  let virtualizationTimer: number | null = null
  let zoomEndTimer: number | null = null

  let isConnecting = false

  // Tracks active touch/pen/mouse points by id, so two points can drive a pinch.
  const activePointers = new Map<number, { x: number; y: number }>()
  let isPinching = false
  let pinchPrevDist = 0
  let pinchPrevMidX = 0
  let pinchPrevMidY = 0

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Helper
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const getScreenCoords = (
    e: MouseEvent,
  ): { screenX: number; screenY: number } => {
    const rect = container.getBoundingClientRect()
    const { clientX, clientY } = e
    return {
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
    }
  }

  const cleanupDrag = (
    move: (e: PointerEvent) => void,
    up: (e: PointerEvent) => void,
  ) => {
    container.classList.remove('dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }

  const scheduleVirtualization = () => {
    if (virtualizationTimer) return
    virtualizationTimer = window.setTimeout(() => {
      onVirtualize()
      virtualizationTimer = null
    }, 100)
  }

  const scheduleZoomEnd = () => {
    if (!onZoomEnd) return
    if (zoomEndTimer) window.clearTimeout(zoomEndTimer)
    zoomEndTimer = window.setTimeout(() => {
      onZoomEnd()
      zoomEndTimer = null
    }, 150)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Zoom Handler
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (isConnecting) return

    const { screenX, screenY } = getScreenCoords(e)

    const newViewport = zoomAtPoint({
      viewport,
      screenX,
      screenY,
      delta: e.deltaY,
    })

    viewport.x = newViewport.x
    viewport.y = newViewport.y
    viewport.zoom = newViewport.zoom

    applyViewport({
      canvasRoot: getCanvasRoot(),
      edgeTransformGroup: getEdgeTransformGroup(),
      viewport,
    })
    scheduleVirtualization()
    scheduleZoomEnd()
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Pan Handlers
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onPointerMove = (e: PointerEvent) => {
    shouldDeselectOnPointerUp = false

    const { screenX, screenY } = getScreenCoords(e)

    const dx = screenX - startX
    const dy = screenY - startY

    viewport.x += dx
    viewport.y += dy

    startX = screenX
    startY = screenY

    applyViewport({
      canvasRoot: getCanvasRoot(),
      edgeTransformGroup: getEdgeTransformGroup(),
      viewport,
    })
    scheduleVirtualization()
  }

  const onPointerUp = () => {
    if (shouldDeselectOnPointerUp) {
      deselectAll(selection)
      applySelectionStyles(container, selection)
      onSelectionChange?.()
    }
    cleanupDrag(onPointerMove, onPointerUp)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Node Drag Handlers
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onNodePointerMove = (e: PointerEvent) => {
    const { screenX, screenY } = getScreenCoords(e)

    const { x: canvasX, y: canvasY } = screenToCanvas(
      screenX,
      screenY,
      viewport,
    )

    const dx = canvasX - startX
    const dy = canvasY - startY

    startX = canvasX
    startY = canvasY

    // Push the pre-drag snapshot only once the node actually starts moving —
    // a click that never drags shouldn't add a history entry.
    if (!nodeDragStarted) {
      pushState(history, graph)
      nodeDragStarted = true
      onNodeDragStart?.()
    }

    const nodeIds = selection.nodeIds.has(draggingNode.id)
      ? Array.from(selection.nodeIds)
      : [draggingNode.id]

    for (const nodeId of nodeIds) {
      const node = graph.nodes[nodeId]
      updateNode({
        graph,
        container,
        nodeId: node.id,
        changes: {
          position: {
            x: node.position.x + dx,
            y: node.position.y + dy,
          },
        },
      })
      updateNodeTransform(container, node.id, node.position)

      const connectedEdges = getConnectedEdges(graph, node.id)
      connectedEdges.forEach((edge) =>
        updateEdgePath(container, edge.id, graph),
      )
    }

    onUpdate?.()
  }

  const onNodePointerUp = () => {
    if (nodeDragStarted) onNodeDragEnd?.()
    cleanupDrag(onNodePointerMove, onNodePointerUp)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Port Connection Handlers
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onPortPointerMove = (e: PointerEvent) => {
    const { screenX, screenY } = getScreenCoords(e)

    const { x: cursorX, y: cursorY } = screenToCanvas(
      screenX,
      screenY,
      viewport,
    )

    const { x: sourceX, y: sourceY } = getPortPosition(sourceNode, sourcePort)
    pendingEdge.setAttribute('d', edgePath(sourceX, sourceY, cursorX, cursorY))

    if (hoveredPortEl) {
      hoveredPortEl.classList.remove('wf-port-drop-target')
      hoveredPortEl = null
    }

    const result = findPortAtPosition({
      graph,
      canvasX: cursorX,
      canvasY: cursorY,
      side: 'input',
    })

    if (result) {
      hoveredPortEl = container.querySelector(
        `.wf-port[data-node-id="${result.node.id}"][data-port-id="${result.port.id}"]`,
      ) as HTMLElement
      if (hoveredPortEl) {
        hoveredPortEl.classList.add('wf-port-drop-target')
      }
    }
  }

  const addEdge = (edge: Edge) => {
    graph.edges[edge.id] = edge
    renderEdge({ edgeTransformGroup: getEdgeTransformGroup(), graph, edge })
    onEdgeAdded?.(edge)
  }

  const onPortPointerUp = (e: PointerEvent) => {
    const { screenX, screenY } = getScreenCoords(e)

    const { x: canvasX, y: canvasY } = screenToCanvas(
      screenX,
      screenY,
      viewport,
    )

    const result = findPortAtPosition({
      graph,
      canvasX,
      canvasY,
      side: 'input',
    })

    const newEdge =
      result &&
      createEdge({
        sourceNodeId: sourceNode.id,
        sourcePortId: sourcePort.id,
        targetNodeId: result.node.id,
        targetPortId: result.port.id,
      })

    // The dragged edge stays in the graph, so dropping on its own (or any
    // already-connected) port fails validation and reverts.
    const valid =
      newEdge && connectionValidator({ graph, ...newEdge, customValidator })
        ? newEdge
        : null

    if (reconnectingEdgeId) {
      const oldEdge = graph.edges[reconnectingEdgeId]
      if (oldEdge && valid) {
        pushState(history, graph)
        delete graph.edges[oldEdge.id]
        removeEdgeElement(container, oldEdge.id)
        onEdgeRemoved?.(oldEdge)
        addEdge(valid)
        onUpdate?.()
      } else if (oldEdge) {
        setEdgeHidden(container, oldEdge.id, false)
      }
      reconnectingEdgeId = null
    } else if (valid) {
      pushState(history, graph)
      addEdge(valid)
      onUpdate?.()
    }

    // Cleanups
    if (hoveredPortEl) {
      hoveredPortEl.classList.remove('wf-port-drop-target')
      hoveredPortEl = null
    }
    for (const port of container.querySelectorAll('.wf-port')) {
      port.classList.remove('wf-port-compatible', 'wf-port-incompatible')
    }
    pendingEdge.remove()
    isConnecting = false
    cleanupDrag(onPortPointerMove, onPortPointerUp)
  }

  const beginConnectionDrag = (e: PointerEvent) => {
    isConnecting = true
    pendingEdge = createPendingEdge(sourcePort.color)
    getEdgeTransformGroup().appendChild(pendingEdge)
    onPortPointerMove(e)

    for (const el of container.querySelectorAll('.wf-port')) {
      const node = graph.nodes[(el as HTMLElement).dataset.nodeId!]
      const candidatePort = node.ports.find(
        (p) => p.id === (el as HTMLElement).dataset.portId,
      )
      if (candidatePort && customValidator) {
        const compatible = customValidator(sourcePort, candidatePort)
        el.classList.toggle('wf-port-compatible', compatible)
        el.classList.toggle('wf-port-incompatible', !compatible)
      }
    }

    window.addEventListener('pointermove', onPortPointerMove)
    window.addEventListener('pointerup', onPortPointerUp)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Box Select Handlers
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onBoxSelectPointerMove = (e: PointerEvent) => {
    if (!selectionRectEl) return

    const { screenX, screenY } = getScreenCoords(e)

    const left = Math.min(startX, screenX)
    const top = Math.min(startY, screenY)
    const width = Math.abs(screenX - startX)
    const height = Math.abs(screenY - startY)

    selectionRectEl.style.left = `${left}px`
    selectionRectEl.style.top = `${top}px`
    selectionRectEl.style.width = `${width}px`
    selectionRectEl.style.height = `${height}px`

    const topLeft = screenToCanvas(
      Math.min(startX, screenX),
      Math.min(startY, screenY),
      viewport,
    )
    const bottomRight = screenToCanvas(
      Math.max(startX, screenX),
      Math.max(startY, screenY),
      viewport,
    )

    const selectBounds = {
      left: topLeft.x,
      top: topLeft.y,
      right: bottomRight.x,
      bottom: bottomRight.y,
    }

    deselectAll(selection)
    selection.nodeIds = new Set(preBoxSelection)

    for (const node of Object.values(graph.nodes)) {
      const bounds = nodeBounds(node)
      if (boundsIntersect(bounds, selectBounds)) {
        selectNode(selection, node.id)
      }
    }

    applySelectionStyles(container, selection)
    onSelectionChange?.()
  }

  const onBoxSelectPointerUp = () => {
    selectionRectEl?.remove()
    selectionRectEl = null
    cleanupDrag(onBoxSelectPointerMove, onBoxSelectPointerUp)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Pinch Zoom
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  // Abandon any single-pointer drag in progress so it doesn't fight a pinch
  // that starts when a second finger lands mid-gesture.
  const cancelActiveDrag = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointermove', onNodePointerMove)
    window.removeEventListener('pointerup', onNodePointerUp)
    window.removeEventListener('pointermove', onBoxSelectPointerMove)
    window.removeEventListener('pointerup', onBoxSelectPointerUp)
    selectionRectEl?.remove()
    selectionRectEl = null
    container.classList.remove('dragging')
    shouldDeselectOnPointerUp = false
  }

  const onPinchMove = (e: PointerEvent) => {
    const point = activePointers.get(e.pointerId)
    if (!point) return
    point.x = e.clientX
    point.y = e.clientY

    const points = [...activePointers.values()]
    if (points.length < 2) return
    const [a, b] = points
    const rect = container.getBoundingClientRect()
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const midX = (a.x + b.x) / 2 - rect.left
    const midY = (a.y + b.y) / 2 - rect.top

    if (pinchPrevDist > 0) {
      const zoomed = zoomByFactor({
        viewport,
        screenX: midX,
        screenY: midY,
        factor: dist / pinchPrevDist,
      })
      // Also pan by however far the two-finger midpoint travelled.
      viewport.x = zoomed.x + (midX - pinchPrevMidX)
      viewport.y = zoomed.y + (midY - pinchPrevMidY)
      viewport.zoom = zoomed.zoom
      applyViewport({
        canvasRoot: getCanvasRoot(),
        edgeTransformGroup: getEdgeTransformGroup(),
        viewport,
      })
      scheduleVirtualization()
      scheduleZoomEnd()
    }

    pinchPrevDist = dist
    pinchPrevMidX = midX
    pinchPrevMidY = midY
  }

  // Persistent: keeps the pointer map accurate and ends a pinch when a finger
  // lifts, regardless of which single-pointer flow (if any) is also listening.
  const onTrackedPointerUp = (e: PointerEvent) => {
    activePointers.delete(e.pointerId)
    if (isPinching && activePointers.size < 2) {
      isPinching = false
      pinchPrevDist = 0
      window.removeEventListener('pointermove', onPinchMove)
    }
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  PointerDown Main Dispatcher
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const isInteractiveTarget = (el: HTMLElement) =>
    !!el.closest(
      'input, select, textarea, button, [contenteditable], .wf-nodrag',
    )

  const onPointerDown = (e: PointerEvent) => {
    // Only the primary button drives drag/pan/select; the secondary button is
    // reserved for the context menu (handled by its own listener).
    if (e.button !== 0) return

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointers.size >= 2) {
      if (!isPinching) {
        isPinching = true
        cancelActiveDrag()
        pinchPrevDist = 0
        window.addEventListener('pointermove', onPinchMove)
      }
      return
    }

    const target = e.target as HTMLElement

    if (!isInteractiveTarget(target)) {
      e.preventDefault()
      container.focus()
    }

    container.classList.add('dragging')

    const portEl = target.closest('.wf-port') as HTMLElement
    if (portEl && !readOnly) {
      const nodeEl = portEl.closest('.wf-node') as HTMLElement
      const node = graph.nodes[nodeEl.dataset.nodeId!]
      const port = node.ports.find((p) => p.id === portEl.dataset.portId)!

      // Grabbing a connected input port detaches its edge to reconnect it.
      if (port.side === PORT_SIDE.INPUT) {
        const edge = Object.values(graph.edges).find(
          (edge) =>
            edge.targetNodeId === node.id && edge.targetPortId === port.id,
        )
        if (!edge) {
          container.classList.remove('dragging')
          return
        }
        reconnectingEdgeId = edge.id
        sourceNode = graph.nodes[edge.sourceNodeId]
        sourcePort = sourceNode.ports.find((p) => p.id === edge.sourcePortId)!
        setEdgeHidden(container, edge.id, true)
        beginConnectionDrag(e)
        return
      }

      sourceNode = node
      sourcePort = port
      beginConnectionDrag(e)
      return
    }

    const edgeHitEl = target.closest('.wf-edge-hit') as SVGPathElement
    if (edgeHitEl) {
      const edgeId = edgeHitEl.dataset.edgeId!
      if (e.shiftKey) {
        toggleEdge(selection, edgeId)
      } else {
        deselectAll(selection)
        selectEdge(selection, edgeId)
      }
      applySelectionStyles(container, selection)
      onSelectionChange?.()

      // Pan if dragged
      shouldDeselectOnPointerUp = false
      const panStart = getScreenCoords(e)
      startX = panStart.screenX
      startY = panStart.screenY
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      return
    }

    const nodeEl = target.closest('.wf-node') as HTMLElement
    if (nodeEl && isInteractiveTarget(target)) {
      container.classList.remove('dragging')
      return
    }
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId!
      draggingNode = graph.nodes[nodeId]

      if (e.shiftKey) {
        toggleNode(selection, nodeId)
      } else if (!selection.nodeIds.has(nodeId)) {
        deselectAll(selection)
        selectNode(selection, nodeId)
      }
      applySelectionStyles(container, selection)
      onSelectionChange?.()

      // Repositioning is a view arrangement, not structural editing, so nodes
      // stay draggable even when read-only (only connect/delete/rename/menu are
      // gated).
      const { screenX, screenY } = getScreenCoords(e)
      const { x: canvasX, y: canvasY } = screenToCanvas(
        screenX,
        screenY,
        viewport,
      )
      startX = canvasX
      startY = canvasY
      nodeDragStarted = false

      updateNode({
        graph,
        container,
        nodeId,
        changes: {
          zIndex: nextZIndex(),
        },
      })

      window.addEventListener('pointermove', onNodePointerMove)
      window.addEventListener('pointerup', onNodePointerUp)
      return
    }

    // Background
    const bgStart = getScreenCoords(e)
    startX = bgStart.screenX
    startY = bgStart.screenY
    if (e.shiftKey) {
      // Box selecting — selection is non-destructive, so allowed read-only too.
      preBoxSelection = new Set(selection.nodeIds)
      selectionRectEl = createSelectionRect()
      container.appendChild(selectionRectEl)
      window.addEventListener('pointermove', onBoxSelectPointerMove)
      window.addEventListener('pointerup', onBoxSelectPointerUp)
    } else {
      // Panning
      shouldDeselectOnPointerUp = true
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    }
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Undo Handler
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const handleUndo = () => onUndo?.()
  const handleRedo = () => onRedo?.()

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  KeyDown Main Dispatcher
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const onKeyDown = (e: KeyboardEvent) => {
    // No editing shortcuts on a read-only surface.
    if (readOnly) return

    const target = e.target as HTMLElement | null
    if (!isInScope(target)) return

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return
    }

    const isModifier = e.ctrlKey || e.metaKey

    if (e.key === 'Delete' || e.key === 'Backspace') {
      onDelete?.()
      return
    }

    if (isModifier && e.key === 'z' && !e.shiftKey) {
      handleUndo()
      return
    }

    if (isModifier && e.key === 'z' && e.shiftKey) {
      handleRedo()
      return
    }

    if (isModifier && e.key === 'a') {
      e.preventDefault()
      onSelectAll?.()
      return
    }

    if (isModifier && e.key === 'c') {
      e.preventDefault()
      onCopy?.()
      return
    }

    if (isModifier && e.key === 'x') {
      e.preventDefault()
      onCut?.()
      return
    }

    if (isModifier && e.key === 'v') {
      e.preventDefault()
      const atCanvas = lastCursorScreen
        ? screenToCanvas(lastCursorScreen.x, lastCursorScreen.y, viewport)
        : undefined
      onPaste?.({ atCanvas })
      return
    }

    if (isModifier && e.key === 'd') {
      e.preventDefault()
      onDuplicate?.()
      return
    }
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Cursor Tracking (for paste-at-cursor)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  let lastCursorScreen: { x: number; y: number } | undefined

  const onCursorMove = (e: PointerEvent) => {
    const rect = container.getBoundingClientRect()
    lastCursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onCursorLeave = () => {
    lastCursorScreen = undefined
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Inline Title Rename
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  // Swaps a node's title for a text input. Shared by the title double-click and
  // the context menu's "Rename" action.
  const openTitleEditor = (titleEl: HTMLElement, nodeId: string) => {
    const node = graph.nodes[nodeId]
    if (!node) return
    if (titleEl.parentElement?.querySelector('.wf-node-title-input')) return

    const original = node.name ?? ''
    const input = document.createElement('input')
    input.type = 'text'
    input.classList.add('wf-node-title-input', 'wf-nodrag')
    input.placeholder = 'Name this node…'
    input.value = original

    titleEl.replaceWith(input)

    requestAnimationFrame(() => {
      input.focus()
      if (input.value) input.select()
    })

    let done = false
    const commit = () => {
      if (done) return
      done = true
      if (input.value !== original) {
        // setNodeName rebuilds the header, so the input is removed by that path.
        onNameCommit?.(nodeId, input.value)
      } else {
        input.replaceWith(titleEl)
      }
    }
    const cancel = () => {
      if (done) return
      done = true
      input.replaceWith(titleEl)
    }

    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') {
        ke.preventDefault()
        commit()
      } else if (ke.key === 'Escape') {
        ke.preventDefault()
        cancel()
      }
    })
    input.addEventListener('blur', commit)
  }

  const onDblClick = (e: MouseEvent) => {
    if (readOnly) return
    const target = e.target as HTMLElement
    const titleEl = target.closest('.wf-node-title') as HTMLElement | null
    if (!titleEl) return
    const nodeId = (titleEl.closest('.wf-node') as HTMLElement | null)?.dataset
      .nodeId
    if (!nodeId) return
    e.stopPropagation()
    openTitleEditor(titleEl, nodeId)
  }

  const beginRename = (nodeId: string) => {
    const titleEl = container.querySelector(
      `.wf-node[data-node-id="${nodeId}"] .wf-node-title`,
    ) as HTMLElement | null
    if (titleEl) openTitleEditor(titleEl, nodeId)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Context Menu Handler
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  // Suppresses the native menu and reports the right-click so the host can show
  // its own menu. Text fields keep their native menu so right-click-paste works.
  const handleContextMenu = (e: MouseEvent) => {
    // No edit menu on a read-only surface; let the native menu through.
    if (readOnly) return
    const target = e.target as HTMLElement | null
    if (!isInScope(target)) return
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return
    }
    e.preventDefault()

    const nodeId = (target?.closest('.wf-node') as HTMLElement | null)?.dataset
      .nodeId

    // Mirror pointerdown: right-clicking an unselected node selects just it; a
    // right-click inside an existing selection keeps the whole selection.
    if (nodeId && !selection.nodeIds.has(nodeId)) {
      deselectAll(selection)
      selectNode(selection, nodeId)
      applySelectionStyles(container, selection)
      onSelectionChange?.()
    }

    const { screenX, screenY } = getScreenCoords(e)
    onContextMenu?.({
      nodeId,
      canvas: screenToCanvas(screenX, screenY, viewport),
      client: { x: e.clientX, y: e.clientY },
    })
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Attach Events
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('wheel', onWheel)
  document.addEventListener('keydown', onKeyDown)
  container.addEventListener('dblclick', onDblClick)
  container.addEventListener('contextmenu', handleContextMenu)
  container.addEventListener('pointermove', onCursorMove)
  container.addEventListener('pointerleave', onCursorLeave)
  window.addEventListener('pointerup', onTrackedPointerUp)
  window.addEventListener('pointercancel', onTrackedPointerUp)

  const destroy = () => {
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('wheel', onWheel)
    document.removeEventListener('keydown', onKeyDown)
    container.removeEventListener('dblclick', onDblClick)
    container.removeEventListener('contextmenu', handleContextMenu)
    container.removeEventListener('pointermove', onCursorMove)
    container.removeEventListener('pointerleave', onCursorLeave)
    window.removeEventListener('pointerup', onTrackedPointerUp)
    window.removeEventListener('pointercancel', onTrackedPointerUp)
    window.removeEventListener('pointermove', onPinchMove)
    if (zoomEndTimer) window.clearTimeout(zoomEndTimer)
  }

  return { destroy, beginRename }
}
