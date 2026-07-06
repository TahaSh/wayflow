import {
  type ConfigField,
  isMappable,
  type NodeTypeDefinition,
  type PortTypeRegistry,
  type ToolMetadata,
} from '@wayflow/agent'
import { createArrayOpField, createArrayOpValue } from './array-ops-field'
import {
  createBooleanInput,
  createFieldLabel,
  createJsonInput,
  createJsonValueDisplay,
  createNumberInput,
  createOptionalSliderInput,
  createSelectInput,
  createSliderInput,
  createTextarea,
  createTextInput,
  createValueDisplay,
  type SelectOption,
} from './controls'
import { createFieldsField, createFieldsValue } from './fields-field'
import { createImageSizeField, createImageSizeValue } from './image-size-field'
import {
  createToolsSelectField,
  createToolsSelectValue,
} from './tools-select-field'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type OnChange = (newValue: unknown) => void

// 'fields'-typed schemas use this side channel to commit a row name change
// edge-preserving (vs. the wholesale onChange path that would drop edges).
type OnRenameField = (
  nodeId: string,
  configKey: string,
  oldName: string,
  newName: string,
) => boolean

export type RenderField = (params: {
  field: ConfigField
  value: unknown
  onChange: OnChange
  nodeId: string
  key: string
  onRenameField?: OnRenameField
  portTypes?: PortTypeRegistry
  toolCatalog?: Record<string, ToolMetadata>
}) => HTMLElement

type RenderLabel = (key: string, field: ConfigField) => HTMLElement | null

export interface CreateConfigPanelParams {
  container: HTMLElement
  position?: 'left' | 'right'
  target?: HTMLElement
  renderLabel?: RenderLabel
  renderField?: Partial<Record<ConfigField['type'], RenderField>>
  portTypes?: PortTypeRegistry
  toolCatalog?: Record<string, ToolMetadata>
  onConfigChange: ({
    nodeId,
    key,
    newValue,
  }: {
    nodeId: string
    key: string
    newValue: unknown
  }) => void
  // Returns true if the rename committed (valid, unique). The default 'fields' renderer
  // uses the result to drive the input's invalid-state styling.
  onRenameField?: OnRenameField
  onNameCommit?: (nodeId: string, name: string) => void
  // Renders each field with its read-only display sibling instead of an editable
  // control (inspect-only).
  readOnly?: boolean
}

interface ShowParams {
  nodeId: string
  definition: NodeTypeDefinition
  config: Record<string, unknown>
  name?: string
}

export interface ConfigPanelHandle {
  element: HTMLElement
  show: ({ nodeId, definition, config }: ShowParams) => void
  refresh: (config: Record<string, unknown>) => void
  hide: () => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Default Label
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createDefaultLabel: RenderLabel = (key, field) => {
  return createFieldLabel({ text: field.label ?? key })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Default Field Renderers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const DEFAULT_FIELD_RENDERERS: Record<ConfigField['type'], RenderField> = {
  text: ({ value, onChange }) =>
    createTextInput({ value: value as string, onChange }),
  textarea: ({ value, onChange }) =>
    createTextarea({ value: value as string, onChange }),
  number: ({ field, value, onChange }) =>
    createNumberInput({
      value: value as number | undefined,
      onChange: (v) => onChange(v ?? 0),
      min: field.min,
      max: field.max,
    }),
  slider: ({ field, value, onChange }) =>
    field.optional
      ? createOptionalSliderInput({
          value: typeof value === 'number' ? value : undefined,
          onChange,
          min: field.min ?? 0,
          max: field.max ?? 1,
          step: field.step,
          enabledDefault: field.enabledDefault ?? field.min ?? 0,
        })
      : createSliderInput({
          value: (value as number) ?? field.min ?? 0,
          onChange,
          min: field.min ?? 0,
          max: field.max ?? 1,
          step: field.step,
        }),
  select: ({ field, value, onChange }) =>
    createSelectInput({
      value: value as string,
      onChange,
      options: field.options ?? [],
      emptyHint: field.emptyHint,
    }),
  boolean: ({ value, onChange }) =>
    createBooleanInput({ value: value as boolean, onChange }),
  json: ({ value, onChange }) =>
    createJsonInput({ value: value as string, onChange }),
  fields: (params) => createFieldsField(params),
  'tools-select': (params) => createToolsSelectField(params),
  'image-size': ({ value, onChange }) =>
    createImageSizeField({ value, onChange }),
  'array-op': ({ value, onChange }) => createArrayOpField({ value, onChange }),
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Display Renderers
//
//  The inspect-only siblings of the editable renderers: each renders the
//  committed value as static display instead of an editable control.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const DEFAULT_DISPLAY_RENDERERS: Record<ConfigField['type'], RenderField> = {
  text: ({ value }) => createValueDisplay(asText(value)),
  textarea: ({ value }) =>
    createValueDisplay(asText(value), { multiline: true }),
  number: ({ value }) => createValueDisplay(value == null ? '' : String(value)),
  slider: ({ field, value }) =>
    createValueDisplay(
      typeof value === 'number' ? String(value) : field.optional ? 'Auto' : '',
    ),
  select: ({ field, value }) => createValueDisplay(selectLabel(field, value)),
  boolean: ({ value }) => createValueDisplay(value ? 'Yes' : 'No'),
  json: ({ value }) => createJsonValueDisplay(value),
  fields: ({ field, value, portTypes }) =>
    createFieldsValue({ field, value, portTypes }),
  'tools-select': ({ value, toolCatalog }) =>
    createToolsSelectValue({ value, toolCatalog }),
  'image-size': ({ value }) => createImageSizeValue(value),
  'array-op': ({ value }) => createArrayOpValue(value),
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value)

const selectLabel = (field: ConfigField, value: unknown): string => {
  const options: SelectOption[] = field.options ?? []
  const match = options.find((opt) =>
    typeof opt === 'string' ? opt === value : opt.value === value,
  )
  if (!match) return asText(value)
  return typeof match === 'string' ? match : match.label
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createConfigPanel = ({
  container,
  position = 'right',
  target,
  renderLabel = createDefaultLabel,
  renderField = {},
  portTypes,
  toolCatalog,
  onConfigChange,
  onRenameField,
  onNameCommit,
  readOnly = false,
}: CreateConfigPanelParams): ConfigPanelHandle => {
  const panel = document.createElement('div')
  panel.classList.add('wf-config-panel', `wf-config-panel-${position}`)
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())

  const placeholder = document.createElement('div')
  placeholder.classList.add('wf-config-panel-placeholder')
  placeholder.textContent = 'Select a node to configure'
  panel.appendChild(placeholder)

  const header = document.createElement('div')
  header.classList.add('wf-config-panel-header')
  header.style.display = 'none'
  panel.appendChild(header)

  const body = document.createElement('div')
  body.classList.add('wf-config-panel-body')
  body.style.display = 'none'
  panel.appendChild(body)

  const mountTarget = target ?? container
  mountTarget.appendChild(panel)

  // Read-only inspect swaps in display renderers; host field overrides apply to
  // editing only (an inspect-only view falls back to the built-in displays).
  const fieldRenderers = readOnly
    ? DEFAULT_DISPLAY_RENDERERS
    : { ...DEFAULT_FIELD_RENDERERS, ...renderField }

  interface FieldEntry {
    wrapper: HTMLElement
    fieldEl: HTMLElement
    value: unknown
  }
  const fieldEntries = new Map<string, FieldEntry>()
  let current: ShowParams | undefined

  // "Run once per item" lives outside configSchema — it's a generic execution
  // modifier, not node-type config — so it's tracked and refreshed on its own.
  let perItemSection: HTMLElement | undefined
  let perItemCheckbox: HTMLInputElement | undefined

  const buildPerItemSection = (nodeId: string): HTMLElement => {
    const section = document.createElement('div')
    section.classList.add('wf-config-peritem-section')

    const row = document.createElement('div')
    row.classList.add('wf-config-peritem-row')
    const checkbox = createBooleanInput({
      value: false,
      onChange: (v) =>
        onConfigChange({ nodeId, key: 'runPerItem', newValue: v }),
    })
    perItemCheckbox = checkbox
    row.append(checkbox, createFieldLabel({ text: 'Run once per item' }))

    const hint = document.createElement('div')
    hint.classList.add('wf-config-peritem-hint')
    hint.textContent =
      'Runs this node for each item of a list input, in parallel.'

    section.append(row, hint)
    return section
  }

  const refreshPerItem = (
    definition: NodeTypeDefinition,
    config: Record<string, unknown>,
  ) => {
    if (!perItemSection || !perItemCheckbox) return
    perItemSection.style.display = isMappable(definition, config) ? '' : 'none'
    perItemCheckbox.checked = config.runPerItem === true
  }

  const renderFieldControl = (
    nodeId: string,
    key: string,
    field: ConfigField,
    value: unknown,
  ): HTMLElement =>
    fieldRenderers[field.type]?.({
      field,
      value,
      onChange: (newValue) => onConfigChange({ nodeId, key, newValue }),
      nodeId,
      key,
      portTypes,
      toolCatalog,
      onRenameField,
    }) ?? document.createElement('div')

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Show
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  const buildNameSection = (nodeId: string, name: string | undefined) => {
    const section = document.createElement('div')
    section.classList.add('wf-config-name-section')

    section.appendChild(createFieldLabel({ text: 'Name' }))
    section.appendChild(
      readOnly
        ? createValueDisplay(name ?? '')
        : createTextInput({
            value: name ?? '',
            placeholder: 'Name this node…',
            commitOnBlur: true,
            onChange: (value) => onNameCommit?.(nodeId, value),
          }),
    )

    return section
  }

  const show = (params: ShowParams) => {
    const { nodeId, definition, config, name } = params
    current = params
    placeholder.style.display = 'none'
    header.style.display = ''
    body.style.display = ''

    header.textContent = definition.label
    body.innerHTML = ''
    fieldEntries.clear()

    body.appendChild(buildNameSection(nodeId, name))

    for (const [key, field] of Object.entries(definition.configSchema)) {
      const wrapper = document.createElement('div')
      const label = renderLabel(key, field)
      if (label) {
        wrapper.appendChild(label)
      }

      const value = config[key] ?? field.default
      const fieldEl = renderFieldControl(nodeId, key, field, value)
      wrapper.appendChild(fieldEl)
      body.appendChild(wrapper)
      fieldEntries.set(key, { wrapper, fieldEl, value })
    }

    // "Run once per item" is an editing modifier — omit it from inspect-only.
    if (!readOnly) {
      perItemSection = buildPerItemSection(nodeId)
      body.appendChild(perItemSection)
      refreshPerItem(definition, config)
    }
  }

  const refresh = (config: Record<string, unknown>) => {
    if (!current) return
    current = { ...current, config }
    for (const [key, field] of Object.entries(
      current.definition.configSchema,
    )) {
      const entry = fieldEntries.get(key)
      // Skip the focused field — rebuilding it would drop the user's caret.
      if (!entry || entry.wrapper.contains(document.activeElement)) continue
      const value = config[key] ?? field.default
      if (sameValue(value, entry.value)) continue
      const fieldEl = renderFieldControl(current.nodeId, key, field, value)
      entry.wrapper.replaceChild(fieldEl, entry.fieldEl)
      entry.fieldEl = fieldEl
      entry.value = value
    }
    refreshPerItem(current.definition, config)
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Hide (show placeholder)
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  const hide = () => {
    placeholder.style.display = ''
    header.style.display = 'none'
    body.style.display = 'none'
    body.innerHTML = ''
    fieldEntries.clear()
    perItemSection = undefined
    perItemCheckbox = undefined
    current = undefined
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Destroy
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  const destroy = () => {
    panel.remove()
  }

  return {
    element: panel,
    show,
    refresh,
    hide,
    destroy,
  }
}

// Structural compare: node data is cloned on read, so references always differ.
const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b)
