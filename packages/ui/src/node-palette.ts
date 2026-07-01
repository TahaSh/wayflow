import type { NodeTypeDefinition, NodeTypeRegistry } from '@wayflow/agent'
import { createIcon, isIconName } from './icons'
import { getShellMount } from './shell'
import { attachTooltip, type TooltipHandle } from './tooltip'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type RenderItem = (type: string, definition: NodeTypeDefinition) => HTMLElement
type OnDrop = (type: string, screenPosition: { x: number; y: number }) => void
// Resolves an icon name (built-in or host-registered) to an SVG. null = none.
type IconResolver = (name: string, size?: number) => SVGElement | null

export interface CreateNodePaletteParams {
  container: HTMLElement
  nodeTypes: NodeTypeRegistry
  position?: 'left' | 'right'
  target?: HTMLElement
  renderItem?: RenderItem
  onDrop: OnDrop
  // Resolves node-type icons (built-in + host-registered) so custom icons show
  // in the palette, matching the canvas nodes.
  iconFactory?: IconResolver
  // Returns a reason to grey out a type's item and show as its tooltip (e.g. a
  // `unique` type already placed, or a model node with no models). null = available.
  disabledReason?: (type: string) => string | null
  // Current canvas zoom, so the drag ghost matches the dropped node's size.
  getZoom?: () => number
}

interface SetupDragToCreateParams {
  itemEl: HTMLElement
  container: HTMLElement
  type: string
  definition: NodeTypeDefinition
  onDrop: OnDrop
  iconFactory?: IconResolver
  getZoom?: () => number
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Item icon
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Prefer the host's icon factory (built-in + registered icons); fall back to
// the built-in set when no factory is supplied.
const resolveIcon = (
  def: NodeTypeDefinition,
  iconFactory?: IconResolver,
): SVGElement | null => {
  if (!def.icon) return null
  if (iconFactory) return iconFactory(def.icon, 14)
  return isIconName(def.icon) ? createIcon({ name: def.icon, size: 14 }) : null
}

const createItemIcon = (
  def: NodeTypeDefinition,
  iconFactory?: IconResolver,
): HTMLElement => {
  const chip = document.createElement('span')
  chip.classList.add('wf-node-palette-item-icon')
  const icon = resolveIcon(def, iconFactory)
  if (icon) {
    chip.appendChild(icon)
  } else {
    chip.textContent = (def.label[0] ?? '?').toUpperCase()
  }
  return chip
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Default Item Renderer
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const defaultRenderItem = (
  _type: string,
  def: NodeTypeDefinition,
  iconFactory?: IconResolver,
): HTMLElement => {
  const el = document.createElement('div')
  el.classList.add('wf-node-palette-item')

  const label = document.createElement('span')
  label.classList.add('wf-node-palette-item-label')
  label.textContent = def.label

  el.append(createItemIcon(def, iconFactory), label)
  return el
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Drag Preview (mini node card)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const DRAG_PREVIEW_WIDTH = 220

const createDragPreview = (
  def: NodeTypeDefinition,
  iconFactory?: IconResolver,
): HTMLElement => {
  const card = document.createElement('div')
  card.classList.add('wf-node', 'wf-drag-preview')
  card.style.width = `${DRAG_PREVIEW_WIDTH}px`

  const clip = document.createElement('div')
  clip.classList.add('wf-node-strip-clip')
  const strip = document.createElement('div')
  strip.classList.add('wf-node-strip')
  clip.appendChild(strip)
  card.appendChild(clip)

  const content = document.createElement('div')
  content.classList.add('wf-node-content')

  const header = document.createElement('div')
  header.classList.add('wf-node-header')

  const icon = resolveIcon(def, iconFactory)
  if (icon) {
    const iconWrap = document.createElement('div')
    iconWrap.classList.add('wf-node-header-icon')
    iconWrap.appendChild(icon)
    header.appendChild(iconWrap)
  }

  const textEl = document.createElement('div')
  textEl.classList.add('wf-node-header-text')
  const title = document.createElement('div')
  title.classList.add('wf-node-title', 'wf-node-title-muted')
  title.textContent = def.label
  textEl.appendChild(title)
  header.appendChild(textEl)

  content.appendChild(header)
  card.appendChild(content)
  return card
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Drag Behavior
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const setupDragToCreate = ({
  itemEl,
  container,
  type,
  definition,
  onDrop,
  iconFactory,
  getZoom,
}: SetupDragToCreateParams): (() => void) => {
  let preview: HTMLElement | null = null
  let isDragging = false
  // A completed mouse drag must not also fire the tap-to-add click.
  let suppressNextClick = false
  // The ghost is wider than the palette item, so anchor it so the cursor
  // lands roughly where the new node's header would be.
  const previewAnchorX = 18
  const previewAnchorY = 20

  const isDisabled = () =>
    itemEl.classList.contains('wf-node-palette-item-disabled')

  const onPointerDown = (e: PointerEvent) => {
    if (isDisabled()) return
    suppressNextClick = false
    // Touch only taps (handled on click) so a swipe scrolls the palette instead
    // of fighting a drag. Mouse/pen drag to place a node precisely.
    if (e.pointerType === 'touch') return
    e.preventDefault()
    e.stopPropagation()
    isDragging = false

    const startX = e.clientX
    const startY = e.clientY
    const scale = Math.max(0.5, Math.min(1, getZoom?.() ?? 1))

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return

        isDragging = true
        preview = createDragPreview(definition, iconFactory)
        preview.style.transformOrigin = 'top left'
        getShellMount(itemEl).appendChild(preview)
        itemEl.classList.add('wf-node-palette-item-dragging')
        document.body.classList.add('wf-cursor-grabbing')
      }

      if (!preview) return
      preview.style.transform = `translate(${e.clientX - previewAnchorX}px, ${e.clientY - previewAnchorY}px) scale(${scale}) rotate(-1.5deg)`
    }

    const onPointerUp = (e: PointerEvent) => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      itemEl.classList.remove('wf-node-palette-item-dragging')
      document.body.classList.remove('wf-cursor-grabbing')

      if (preview) {
        preview.remove()
        preview = null
      }

      if (!isDragging) return
      suppressNextClick = true

      const rect = container.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      if (
        screenX >= 0 &&
        screenY >= 0 &&
        screenX <= rect.width &&
        screenY <= rect.height
      ) {
        onDrop(type, { x: screenX, y: screenY })
      }
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  // Tap/click adds the node at the canvas center — the primary path on touch,
  // and a discoverable alternative to dragging on desktop.
  const onClick = () => {
    if (isDisabled() || suppressNextClick) {
      suppressNextClick = false
      return
    }
    const rect = container.getBoundingClientRect()
    onDrop(type, { x: rect.width / 2, y: rect.height / 2 })
  }

  itemEl.addEventListener('pointerdown', onPointerDown)
  itemEl.addEventListener('click', onClick)

  return () => {
    itemEl.removeEventListener('pointerdown', onPointerDown)
    itemEl.removeEventListener('click', onClick)
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createNodePalette = ({
  container,
  nodeTypes,
  position = 'left',
  target,
  renderItem,
  onDrop,
  disabledReason = () => null,
  iconFactory,
  getZoom,
}: CreateNodePaletteParams): {
  element: HTMLElement
  refresh: () => void
  setCompact: (compact: boolean) => void
  destroy: () => void
} => {
  const render: RenderItem =
    renderItem ?? ((type, def) => defaultRenderItem(type, def, iconFactory))

  const palette = document.createElement('div')
  palette.classList.add('wf-node-palette', `wf-node-palette-${position}`)

  let compact = false

  const cleanups: (() => void)[] = []
  const tooltips: TooltipHandle[] = []
  const entries: {
    itemEl: HTMLElement
    group: HTMLElement
    match: string
    type: string
  }[] = []

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Search
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  palette.appendChild(createSearchBox((q) => filterItems(entries, q)))

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Group by Category
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const categories = new Map<
    string,
    { type: string; def: NodeTypeDefinition }[]
  >()
  for (const [type, def] of Object.entries(nodeTypes)) {
    const categoryName = def.category || 'Uncategorized'
    if (!categories.has(categoryName)) {
      categories.set(categoryName, [])
    }
    categories.get(categoryName)!.push({ type, def })
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Render Categories
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  for (const [category, items] of categories) {
    const group = document.createElement('div')
    group.classList.add('wf-node-palette-group')

    const heading = document.createElement('div')
    heading.classList.add('wf-node-palette-group-heading')
    heading.textContent = category
    group.appendChild(heading)

    for (const { type, def } of items) {
      const itemEl = render(type, def)
      const cleanup = setupDragToCreate({
        itemEl,
        container,
        type,
        definition: def,
        onDrop,
        iconFactory,
        getZoom,
      })
      cleanups.push(cleanup)
      const tooltip = attachTooltip(
        itemEl,
        () => disabledReason(type) ?? (compact ? def.label : null),
        { delay: () => (compact ? 0 : undefined) },
      )
      cleanups.push(tooltip.destroy)
      tooltips.push(tooltip)
      group.appendChild(itemEl)
      entries.push({
        itemEl,
        group,
        match: `${def.label ?? ''} ${type}`.toLowerCase(),
        type,
      })
    }
    palette.appendChild(group)
  }

  const refresh = () => {
    for (const entry of entries) {
      entry.itemEl.classList.toggle(
        'wf-node-palette-item-disabled',
        disabledReason(entry.type) != null,
      )
    }
    for (const tooltip of tooltips) tooltip.refresh()
  }
  refresh()

  const setCompact = (next: boolean) => {
    if (compact === next) return
    compact = next
    palette.classList.toggle('wf-node-palette--compact', next)
    for (const tooltip of tooltips) tooltip.refresh()
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Mount
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const mountTarget = target ?? container
  mountTarget.appendChild(palette)

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Cleanup
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  const destroy = () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
    palette.remove()
  }

  return { element: palette, refresh, setCompact, destroy }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Search
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createSearchBox = (onQuery: (q: string) => void): HTMLElement => {
  const wrapper = document.createElement('div')
  wrapper.classList.add('wf-node-palette-search')
  wrapper.appendChild(createIcon({ name: 'search', size: 13 }))

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Search nodes…'
  input.spellcheck = false
  input.classList.add('wf-node-palette-search-input')
  input.addEventListener('input', () => onQuery(input.value))
  wrapper.appendChild(input)

  return wrapper
}

type FilterEntry = { itemEl: HTMLElement; group: HTMLElement; match: string }

const filterItems = (entries: FilterEntry[], rawQuery: string): void => {
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    for (const { itemEl, group } of entries) {
      itemEl.style.display = ''
      group.style.display = ''
    }
    return
  }
  const visibleGroups = new Set<HTMLElement>()
  for (const { itemEl, group, match } of entries) {
    if (match.includes(query)) {
      itemEl.style.display = ''
      visibleGroups.add(group)
    } else {
      itemEl.style.display = 'none'
    }
  }
  for (const { group } of entries) {
    group.style.display = visibleGroups.has(group) ? '' : 'none'
  }
}
