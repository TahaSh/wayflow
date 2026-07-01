import type {
  ConfigField,
  PortTypeRegistry,
  ToolMetadata,
} from '@wayflow/agent'
import { createIcon } from './icons'
import { getShellMount } from './shell'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type OnChange = (newValue: unknown) => void

type OnRenameField = (
  nodeId: string,
  configKey: string,
  oldName: string,
  newName: string,
) => boolean

interface CreateToolsSelectFieldParams {
  field: ConfigField
  value: unknown
  onChange: OnChange
  nodeId: string
  key: string
  onRenameField?: OnRenameField
  portTypes?: PortTypeRegistry
  toolCatalog?: Record<string, ToolMetadata>
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createToolsSelectField = ({
  value,
  onChange,
  toolCatalog,
}: CreateToolsSelectFieldParams): HTMLElement => {
  const catalog = toolCatalog ?? {}
  const container = createContainer()
  let selected: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((s): s is string => typeof s === 'string')
    : []

  const commit = (next: string[]) => {
    selected = next
    onChange(next)
    render()
  }

  const render = () => {
    container.innerHTML = ''

    for (const name of selected) {
      const meta = catalog[name]
      container.appendChild(
        createToolChip({
          name,
          description: meta?.description,
          missing: !meta,
          onRemove: () => commit(selected.filter((n) => n !== name)),
        }),
      )
    }

    if (selected.length === 0 && Object.keys(catalog).length === 0) {
      container.appendChild(createEmptyState())
      return
    }

    container.appendChild(
      createAddButton({
        catalog,
        selected,
        onAdd: (name) => commit([...selected, name]),
      }),
    )
  }

  render()
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Display
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ToolsSelectValueParams {
  value: unknown
  toolCatalog?: Record<string, ToolMetadata>
}

export const createToolsSelectValue = ({
  value,
  toolCatalog,
}: ToolsSelectValueParams): HTMLElement => {
  const catalog = toolCatalog ?? {}
  const selected: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((s): s is string => typeof s === 'string')
    : []

  const container = createContainer()
  if (selected.length === 0) {
    const empty = document.createElement('span')
    empty.classList.add('wf-taginput-empty')
    empty.textContent = 'No tools.'
    container.appendChild(empty)
    return container
  }

  for (const name of selected) {
    const meta = catalog[name]
    container.appendChild(
      createReadonlyToolChip({ name, description: meta?.description }),
    )
  }
  return container
}

const createReadonlyToolChip = ({
  name,
  description,
}: {
  name: string
  description?: string
}): HTMLElement => {
  const chip = document.createElement('span')
  chip.classList.add('wf-chip', 'wf-chip-readonly')
  if (description) chip.title = description

  const iconWrap = document.createElement('span')
  iconWrap.classList.add('wf-chip-icon')
  iconWrap.appendChild(createIcon({ name: 'tool', size: 11 }))
  chip.appendChild(iconWrap)

  const label = document.createElement('span')
  label.classList.add('wf-chip-name')
  label.textContent = name
  chip.appendChild(label)

  return chip
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Container
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createContainer = (): HTMLElement => {
  const el = document.createElement('div')
  el.classList.add('wf-taginput')
  return el
}

const createEmptyState = (): HTMLElement => {
  const el = document.createElement('span')
  el.classList.add('wf-taginput-empty')
  el.textContent = 'No tools available.'
  return el
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Chip
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CreateToolChipParams {
  name: string
  description?: string
  missing: boolean
  onRemove: () => void
}

const createToolChip = ({
  name,
  description,
  missing,
  onRemove,
}: CreateToolChipParams): HTMLElement => {
  const chip = document.createElement('span')
  chip.classList.add('wf-chip')
  if (missing) chip.dataset.missing = 'true'

  if (description) chip.title = description
  else if (missing) chip.title = `Tool "${name}" is not in the editor catalog.`

  const iconWrap = document.createElement('span')
  iconWrap.classList.add('wf-chip-icon')
  iconWrap.appendChild(createIcon({ name: 'tool', size: 11 }))
  chip.appendChild(iconWrap)

  const label = document.createElement('span')
  label.classList.add('wf-chip-name')
  label.textContent = name
  chip.appendChild(label)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.classList.add('wf-chip-remove')
  remove.setAttribute('aria-label', `Remove ${name}`)
  remove.appendChild(createIcon({ name: 'x', size: 10, strokeWidth: 2 }))
  remove.addEventListener('click', onRemove)
  chip.appendChild(remove)

  return chip
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Add Button
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CreateAddButtonParams {
  catalog: Record<string, ToolMetadata>
  selected: string[]
  onAdd: (name: string) => void
}

const createAddButton = ({
  catalog,
  selected,
  onAdd,
}: CreateAddButtonParams): HTMLElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.add('wf-taginput-add')
  button.appendChild(createIcon({ name: 'plus', size: 11, strokeWidth: 2 }))
  const text = document.createElement('span')
  text.textContent = 'Add tool'
  button.appendChild(text)

  let popover: PopoverHandle | null = null
  const close = () => {
    popover?.destroy()
    popover = null
    delete button.dataset.active
  }
  const open = () => {
    if (popover) return
    button.dataset.active = 'true'
    popover = openToolPicker({
      anchor: button,
      catalog,
      selected,
      onPick: (name) => {
        close()
        onAdd(name)
      },
      onClose: close,
    })
  }
  button.addEventListener('click', () => {
    if (popover) close()
    else open()
  })

  return button
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Picker Popover
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface PopoverHandle {
  destroy: () => void
}

interface OpenToolPickerParams {
  anchor: HTMLElement
  catalog: Record<string, ToolMetadata>
  selected: string[]
  onPick: (name: string) => void
  onClose: () => void
}

const openToolPicker = ({
  anchor,
  catalog,
  selected,
  onPick,
  onClose,
}: OpenToolPickerParams): PopoverHandle => {
  const popover = document.createElement('div')
  popover.classList.add('wf-popover')

  let query = ''
  const search = createSearchRow({
    onInput: (next) => {
      query = next
      renderList()
    },
  })
  popover.appendChild(search.el)

  const list = document.createElement('div')
  list.classList.add('wf-popover-list')
  popover.appendChild(list)

  const selectedSet = new Set(selected)
  const renderList = () => {
    list.innerHTML = ''
    const needle = query.trim().toLowerCase()
    const matches = Object.entries(catalog).filter(([name, meta]) => {
      if (!needle) return true
      return (
        name.toLowerCase().includes(needle) ||
        meta.description.toLowerCase().includes(needle)
      )
    })
    if (matches.length === 0) {
      const empty = document.createElement('div')
      empty.classList.add('wf-popover-empty')
      empty.textContent = needle
        ? 'No tools match your search.'
        : 'No tools registered.'
      list.appendChild(empty)
      return
    }
    for (const [name, meta] of matches) {
      const alreadySelected = selectedSet.has(name)
      list.appendChild(
        createPickerItem({
          name,
          description: meta.description,
          selected: alreadySelected,
          onClick: () => {
            if (!alreadySelected) onPick(name)
          },
        }),
      )
    }
  }
  renderList()

  getShellMount(anchor).appendChild(popover)
  positionPopover(popover, anchor)
  search.focus()

  const onDocPointer = (e: PointerEvent) => {
    if (popover.contains(e.target as Node)) return
    if (anchor.contains(e.target as Node)) return
    onClose()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onKey)

  return {
    destroy: () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
      popover.remove()
    },
  }
}

interface CreateSearchRowParams {
  onInput: (next: string) => void
}

interface SearchRowHandle {
  el: HTMLElement
  focus: () => void
}

const createSearchRow = ({
  onInput,
}: CreateSearchRowParams): SearchRowHandle => {
  const row = document.createElement('div')
  row.classList.add('wf-popover-search')

  const iconWrap = document.createElement('span')
  iconWrap.classList.add('wf-popover-search-icon')
  iconWrap.appendChild(createIcon({ name: 'search', size: 13 }))
  row.appendChild(iconWrap)

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Search tools…'
  input.classList.add('wf-popover-search-input')
  input.spellcheck = false
  input.addEventListener('input', () => onInput(input.value))
  row.appendChild(input)

  const kbd = document.createElement('span')
  kbd.classList.add('wf-popover-search-kbd')
  kbd.textContent = 'esc'
  row.appendChild(kbd)

  return {
    el: row,
    focus: () => input.focus(),
  }
}

interface CreatePickerItemParams {
  name: string
  description: string
  selected: boolean
  onClick: () => void
}

const createPickerItem = ({
  name,
  description,
  selected,
  onClick,
}: CreatePickerItemParams): HTMLElement => {
  const item = document.createElement('div')
  item.classList.add('wf-popover-item')
  if (selected) item.dataset.selected = 'true'
  item.addEventListener('click', onClick)

  const iconWrap = document.createElement('span')
  iconWrap.classList.add('wf-popover-item-icon')
  iconWrap.appendChild(createIcon({ name: 'tool', size: 12 }))
  item.appendChild(iconWrap)

  const body = document.createElement('div')
  body.classList.add('wf-popover-item-body')
  const nameEl = document.createElement('div')
  nameEl.classList.add('wf-popover-item-name')
  nameEl.textContent = name
  body.appendChild(nameEl)
  const descEl = document.createElement('div')
  descEl.classList.add('wf-popover-item-desc')
  descEl.textContent = description
  body.appendChild(descEl)
  item.appendChild(body)

  const check = document.createElement('span')
  check.classList.add('wf-popover-item-check')
  check.appendChild(createIcon({ name: 'check', size: 13, strokeWidth: 2.4 }))
  item.appendChild(check)

  return item
}

const positionPopover = (popover: HTMLElement, anchor: HTMLElement): void => {
  const anchorRect = anchor.getBoundingClientRect()
  const popRect = popover.getBoundingClientRect()
  const gap = 6
  const margin = 8

  const spaceBelow = window.innerHeight - anchorRect.bottom - margin
  const spaceAbove = anchorRect.top - margin
  const placeAbove =
    spaceBelow < popRect.height + gap && spaceAbove > spaceBelow
  popover.style.top = placeAbove
    ? `${anchorRect.top - popRect.height - gap}px`
    : `${anchorRect.bottom + gap}px`

  let left = anchorRect.left
  if (left + popRect.width > window.innerWidth - margin) {
    left = window.innerWidth - popRect.width - margin
  }
  if (left < margin) left = margin
  popover.style.left = `${left}px`
}
