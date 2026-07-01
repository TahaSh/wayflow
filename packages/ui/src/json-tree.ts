import { createIcon } from './icons'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Top-level containers start expanded; deeper ones collapsed, so the shape
// reads at a glance without burying it under nested data.
const EXPANDED_DEPTH = 0
const PREVIEW_KEYS = 4

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A collapsible view of a JSON value. Built once from a static value (the caller
// bounds its size), so the whole tree is in the DOM and toggling flips display.
export const createJsonTree = (value: unknown): HTMLElement => {
  const root = document.createElement('div')
  root.classList.add('wf-json-tree')
  root.appendChild(renderEntry(null, value, 0))
  return root
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Rendering
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const isContainer = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

const renderEntry = (
  label: string | null,
  value: unknown,
  depth: number,
): HTMLElement => {
  if (!isContainer(value)) return renderLeaf(label, value)

  const entries = Object.entries(value)
  const isArray = Array.isArray(value)
  if (entries.length === 0) return renderLeaf(label, value)

  return renderContainer(label, entries, isArray, depth)
}

const renderContainer = (
  label: string | null,
  entries: [string, unknown][],
  isArray: boolean,
  depth: number,
): HTMLElement => {
  const node = document.createElement('div')
  node.classList.add('wf-json-tree__node')

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.classList.add('wf-json-tree__toggle')

  const chevron = createIcon({ name: 'chevron-right', size: 12 })
  chevron.classList.add('wf-json-tree__chevron')
  toggle.appendChild(chevron)

  if (label !== null) toggle.appendChild(renderKey(label))

  const count = document.createElement('span')
  count.classList.add('wf-json-tree__count')
  count.textContent = isArray ? `[${entries.length}]` : `{${entries.length}}`
  toggle.appendChild(count)

  // Objects preview their keys while collapsed; arrays don't — their items
  // preview themselves.
  const preview = isArray ? null : renderPreview(entries)
  if (preview) toggle.appendChild(preview)

  const children = document.createElement('div')
  children.classList.add('wf-json-tree__children')
  for (const [key, child] of entries) {
    children.appendChild(renderEntry(key, child, depth + 1))
  }

  const setOpen = (open: boolean) => {
    node.classList.toggle('wf-json-tree__node--open', open)
    children.style.display = open ? '' : 'none'
    if (preview) preview.style.display = open ? 'none' : ''
  }
  setOpen(depth <= EXPANDED_DEPTH)
  toggle.addEventListener('click', () =>
    setOpen(!node.classList.contains('wf-json-tree__node--open')),
  )

  node.append(toggle, children)
  return node
}

const renderLeaf = (label: string | null, value: unknown): HTMLElement => {
  const row = document.createElement('div')
  row.classList.add('wf-json-tree__row')
  if (label !== null) row.appendChild(renderKey(label))
  row.appendChild(renderValue(value))
  return row
}

const renderKey = (label: string): HTMLElement => {
  const key = document.createElement('span')
  key.classList.add('wf-json-tree__key')
  key.textContent = label
  return key
}

const renderPreview = (entries: [string, unknown][]): HTMLElement => {
  const preview = document.createElement('span')
  preview.classList.add('wf-json-tree__preview')
  const keys = entries.slice(0, PREVIEW_KEYS).map(([key]) => key)
  const more = entries.length > PREVIEW_KEYS ? ', …' : ''
  preview.textContent = keys.join(', ') + more
  return preview
}

const renderValue = (value: unknown): HTMLElement => {
  const span = document.createElement('span')
  if (typeof value === 'string') {
    span.classList.add('wf-json-tree__string')
    span.textContent = `"${value}"`
  } else if (typeof value === 'number') {
    span.classList.add('wf-json-tree__number')
    span.textContent = String(value)
  } else if (typeof value === 'boolean') {
    span.classList.add('wf-json-tree__boolean')
    span.textContent = String(value)
  } else if (Array.isArray(value)) {
    span.classList.add('wf-json-tree__empty')
    span.textContent = '[]'
  } else if (value !== null && typeof value === 'object') {
    span.classList.add('wf-json-tree__empty')
    span.textContent = '{}'
  } else {
    span.classList.add('wf-json-tree__null')
    span.textContent = value === undefined ? 'undefined' : 'null'
  }
  return span
}
