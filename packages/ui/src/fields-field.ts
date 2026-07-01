import {
  type ConfigField,
  type Field,
  isFieldRequired,
  type PortTypeRegistry,
} from '@wayflow/agent'
import {
  createBooleanInput,
  createNumberInput,
  createSegmentedControl,
  createSelectInput,
  createTextInput,
  createValueDisplay,
  setControlInvalid,
} from './controls'
import { createIcon } from './icons'
import { createImageInput, IMAGE_INPUT_CONTEXT } from './image-input'
import { createListValueInput } from './value-list'

type OnChange = (newValue: unknown) => void

type OnRenameField = (
  nodeId: string,
  configKey: string,
  oldName: string,
  newName: string,
) => boolean

interface CreateFieldsFieldParams {
  field: ConfigField
  value: unknown
  onChange: OnChange
  nodeId: string
  key: string
  onRenameField?: OnRenameField
  portTypes?: PortTypeRegistry
}

const FALLBACK_PORT_TYPES = ['string', 'number', 'boolean', 'json', 'any']

export const createFieldsField = ({
  field,
  value,
  onChange,
  nodeId,
  key,
  onRenameField,
  portTypes,
}: CreateFieldsFieldParams): HTMLElement => {
  const withDefaults = field.withDefaults ?? false
  const lockNames = field.lockNames ?? false
  const dataTypeOptions = portTypes
    ? Object.keys(portTypes)
    : FALLBACK_PORT_TYPES

  const container = document.createElement('div')
  container.classList.add('wf-config-fields')

  // Local source of truth for non-rename mutations (add/delete/dataType/default).
  // Renames commit via onRenameField, which is wired to renameField on the editor —
  // so the editor's data is updated atomically with the port migration.
  let fields: Field[] = Array.isArray(value) ? (value as Field[]) : []

  // Each row's name input registers its live validator here so that when ANY row
  // commits a rename, every other row's red-border state is re-evaluated against
  // the updated fields array — without that, a once-duplicate row stays red after
  // the conflicting peer is renamed away.
  let nameValidators: (() => void)[] = []
  const revalidateAllNames = () => {
    for (const v of nameValidators) v()
  }

  const commitFields = (next: Field[]) => {
    fields = next
    onChange(next)
    render()
  }

  // Value-only path — preserves the focused input (avoids losing focus
  // mid-typing in a default cell). Use when only a row's default changes.
  const commitFieldsValueOnly = (next: Field[]) => {
    fields = next
    onChange(next)
  }

  const render = () => {
    container.innerHTML = ''
    nameValidators = []

    if (lockNames && fields.length === 0) {
      const empty = document.createElement('div')
      empty.classList.add('wf-config-fields-empty')
      empty.textContent = 'No variables referenced yet.'
      container.appendChild(empty)
    }

    fields.forEach((row, index) => {
      container.appendChild(renderRow(row, index))
    })

    if (!lockNames) {
      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.classList.add('wf-config-fields-add')
      addBtn.textContent = '+ Add field'
      addBtn.addEventListener('click', () => {
        const next = [...fields, makeFreshField(fields, dataTypeOptions[0])]
        commitFields(next)
      })
      container.appendChild(addBtn)
    }
  }

  const renderRow = (row: Field, index: number): HTMLElement => {
    const card = document.createElement('div')
    card.classList.add('wf-fieldcard')

    const head = document.createElement('div')
    head.classList.add('wf-fieldcard__head')

    const name = lockNames ? renderLockedName(row) : renderNameInput(row, index)
    name.classList.add('wf-fieldcard__name')
    head.appendChild(name)

    head.appendChild(renderDataTypeSelect(row, index))

    if (!lockNames) head.appendChild(renderRemoveButton(index))
    card.appendChild(head)

    const toggles = document.createElement('div')
    toggles.classList.add('wf-fieldcard__toggles')
    if (field.allowRequired) {
      toggles.appendChild(
        renderToggle('Required', isFieldRequired(row), (on) =>
          patchRow(index, { required: on }),
        ),
      )
    }
    if (withDefaults && field.allowMultiple) {
      toggles.appendChild(
        renderToggle('Multiple values', row.multiple === true, (on) =>
          patchRow(index, {
            multiple: on,
            default: toMultipleDefault(row.default, on),
          }),
        ),
      )
    }
    if (toggles.childElementCount > 0) card.appendChild(toggles)

    if (withDefaults) card.appendChild(renderValueRow(row, index))

    return card
  }

  const patchRow = (index: number, patch: Partial<Field>) => {
    commitFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (on: boolean) => void,
  ): HTMLElement => {
    const toggle = document.createElement('label')
    toggle.classList.add('wf-fieldcard__toggle')
    toggle.append(createBooleanInput({ value, onChange }))
    const text = document.createElement('span')
    text.textContent = label
    toggle.appendChild(text)
    return toggle
  }

  const renderRemoveButton = (index: number): HTMLElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.add('wf-fieldcard__remove')
    button.setAttribute('aria-label', 'Remove field')
    button.appendChild(createIcon({ name: 'x', size: 13 }))
    button.addEventListener('click', () => {
      commitFields(fields.filter((_, i) => i !== index))
    })
    return button
  }

  const renderValueRow = (row: Field, index: number): HTMLElement => {
    const valueRow = document.createElement('div')
    valueRow.classList.add('wf-fieldcard__value')

    const label = document.createElement('span')
    label.classList.add('wf-fieldcard__vlabel')
    const dot = document.createElement('span')
    dot.classList.add('wf-fieldcard__typedot')
    dot.style.background = `var(--wf-port-${row.dataType}, var(--wf-port-any))`
    label.append(dot, row.multiple ? 'Default values' : 'Default value')

    valueRow.append(label, renderDefaultInput(row, index))
    return valueRow
  }

  const renderLockedName = (row: Field): HTMLElement => {
    const span = document.createElement('span')
    span.classList.add('wf-config-fields-name', 'wf-config-fields-name-locked')
    span.textContent = row.name
    return span
  }

  const renderNameInput = (row: Field, index: number): HTMLElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.classList.add('wf-control-input', 'wf-config-fields-name')
    input.value = row.name
    input.spellcheck = false

    const setInvalid = (msg: string | null) =>
      setControlInvalid(input, msg !== null, msg ?? undefined)

    const validateLive = () => {
      const candidate = input.value.trim()
      if (candidate === row.name) {
        setInvalid(null)
        return
      }
      if (!candidate) {
        setInvalid('Name is required')
        return
      }
      const isDuplicate = fields.some(
        (f, i) => i !== index && f.name === candidate,
      )
      setInvalid(isDuplicate ? 'Name must be unique on this node' : null)
    }
    nameValidators.push(validateLive)

    const commit = () => {
      const candidate = input.value.trim()
      const oldName = row.name
      if (candidate === oldName) {
        setInvalid(null)
        return
      }
      if (!candidate) {
        input.value = oldName
        setInvalid(null)
        return
      }
      const isDuplicate = fields.some(
        (f, i) => i !== index && f.name === candidate,
      )
      if (isDuplicate) {
        // keep the input in invalid state; do not commit
        setInvalid('Name must be unique on this node')
        return
      }

      if (onRenameField) {
        const ok = onRenameField(nodeId, key, oldName, candidate)
        if (!ok) {
          setInvalid('Rename rejected')
          return
        }
        // success — sync local model
        fields = fields.map((f, i) =>
          i === index ? { ...f, name: candidate } : f,
        )
        row.name = candidate
        setInvalid(null)
        revalidateAllNames()
      } else {
        // No rename channel wired — fall back to wholesale (will drop edges).
        const next = fields.map((f, i) =>
          i === index ? { ...f, name: candidate } : f,
        )
        commitFields(next)
      }
    }

    input.addEventListener('input', validateLive)

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur() // triggers commit
      } else if (e.key === 'Escape') {
        e.preventDefault()
        input.value = row.name
        setInvalid(null)
        input.blur()
      }
    })

    input.addEventListener('blur', commit)

    return input
  }

  const renderDataTypeSelect = (row: Field, index: number): HTMLElement => {
    const select = createSelectInput({
      value: row.dataType,
      options: dataTypeOptions.map((dt) => ({
        value: dt,
        label: portTypes?.[dt]?.label ?? dt,
      })),
      onChange: (next) => {
        const newFields = fields.map((f, i) =>
          i === index ? { ...f, dataType: next } : f,
        )
        commitFields(newFields)
      },
    })
    select.classList.add('wf-fieldcard__type')
    return select
  }

  const renderDefaultInput = (row: Field, index: number): HTMLElement => {
    const setRowDefault = (next: unknown) => {
      const newFields = fields.map((f, i) =>
        i === index ? { ...f, default: next } : f,
      )
      commitFieldsValueOnly(newFields)
    }

    if (row.multiple) {
      return createListValueInput({
        value: Array.isArray(row.default) ? row.default : [],
        onChange: setRowDefault,
        renderItem: (value, onItemChange) =>
          createScalarDefault(row.dataType, value, onItemChange),
      })
    }

    return createScalarDefault(row.dataType, row.default, setRowDefault)
  }

  const createScalarDefault = (
    dataType: string,
    value: unknown,
    onChange: (next: unknown) => void,
  ): HTMLElement => {
    if (dataType === 'boolean') {
      return createBooleanToggle(Boolean(value), onChange)
    }
    if (dataType === 'number') {
      return createNumberInput({
        value: typeof value === 'number' ? value : undefined,
        onChange,
        commitOnBlur: true,
      })
    }
    if (dataType === 'string') {
      return createTextInput({
        value: typeof value === 'string' ? value : '',
        onChange,
        commitOnBlur: true,
      })
    }
    if (dataType === 'image') {
      return createImageInput({
        value: typeof value === 'string' ? value : '',
        onChange,
        context: IMAGE_INPUT_CONTEXT.COMPACT,
      })
    }

    // For other dataTypes (json/custom), defaults are unsupported for now.
    const placeholder = document.createElement('span')
    placeholder.classList.add('wf-config-fields-default-na')
    placeholder.textContent = '—'
    placeholder.title = `No default editor for type "${dataType}"`
    return placeholder
  }

  render()
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Display
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface FieldsValueParams {
  field: ConfigField
  value: unknown
  portTypes?: PortTypeRegistry
}

export const createFieldsValue = ({
  field,
  value,
  portTypes,
}: FieldsValueParams): HTMLElement => {
  const fields: Field[] = Array.isArray(value) ? (value as Field[]) : []
  const withDefaults = field.withDefaults ?? false

  const container = document.createElement('div')
  container.classList.add('wf-config-fields')

  if (fields.length === 0) {
    const empty = document.createElement('div')
    empty.classList.add('wf-config-fields-empty')
    empty.textContent = 'No fields.'
    container.appendChild(empty)
    return container
  }

  for (const row of fields) {
    const card = document.createElement('div')
    card.classList.add('wf-fieldcard')

    const head = document.createElement('div')
    head.classList.add('wf-fieldcard__head')

    const name = document.createElement('span')
    name.classList.add('wf-fieldcard__name', 'wf-config-fields-name-locked')
    name.textContent = row.name
    head.appendChild(name)

    const type = document.createElement('span')
    type.classList.add('wf-fieldcard__type-readonly')
    type.textContent = portTypes?.[row.dataType]?.label ?? row.dataType
    head.appendChild(type)
    card.appendChild(head)

    if (withDefaults) {
      const valueRow = document.createElement('div')
      valueRow.classList.add('wf-fieldcard__value')
      const label = document.createElement('span')
      label.classList.add('wf-fieldcard__vlabel')
      const dot = document.createElement('span')
      dot.classList.add('wf-fieldcard__typedot')
      dot.style.background = `var(--wf-port-${row.dataType}, var(--wf-port-any))`
      label.append(dot, row.multiple ? 'Default values' : 'Default value')
      valueRow.append(label, createValueDisplay(formatDefault(row.default)))
      card.appendChild(valueRow)
    }

    container.appendChild(card)
  }

  return container
}

const formatDefault = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map(formatDefault).join(', ')
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Converts a row's default when toggling "Multiple values": wrap an existing
// single value into a list (or start empty); unwrap to the first on the way back.
const toMultipleDefault = (current: unknown, multiple: boolean): unknown => {
  if (multiple) {
    if (Array.isArray(current)) return current
    return current === undefined || current === '' ? [] : [current]
  }
  return Array.isArray(current) ? (current[0] ?? '') : current
}

const createBooleanToggle = (
  value: boolean,
  onChange: (value: boolean) => void,
): HTMLElement =>
  createSegmentedControl({
    options: [
      { label: 'true', value: 'true' },
      { label: 'false', value: 'false' },
    ],
    value: String(value),
    onChange: (v) => onChange(v === 'true'),
  })

const makeFreshField = (existing: Field[], dataType = 'string'): Field => {
  const taken = new Set(existing.map((f) => f.name))
  let n = existing.length + 1
  let name = `field${n}`
  while (taken.has(name)) {
    n += 1
    name = `field${n}`
  }
  return { name, dataType, default: dataType === 'string' ? '' : undefined }
}
