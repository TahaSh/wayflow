import { type Field, isFieldRequired, isFieldValueEmpty } from '@wayflow/agent'
import type { Graph } from '@wayflow/core'
import {
  BUTTON_VARIANT,
  createBooleanInput,
  createControlError,
  createFieldLabel,
  createJsonInput,
  createNumberInput,
  createTextInput,
  setControlInvalid,
} from './controls'
import { openDialog } from './dialog'
import { createImageInput } from './image-input'
import { createListValueInput } from './value-list'

interface OpenInputsModalParams {
  graph: Graph
  onSave: (values: Record<string, unknown>) => void
  onSaveAndRun: (values: Record<string, unknown>) => void
  anchor?: HTMLElement
}

interface OpenInputsRunParams {
  graph: Graph
  onRun: (values: Record<string, unknown>) => void
  anchor?: HTMLElement
}

export const hasInputFields = (graph: Graph): boolean =>
  collectInputFields(graph).length > 0

// A required input whose default can't satisfy it — Run must collect a value.
export const hasUnmetRequiredInputs = (graph: Graph): boolean =>
  collectInputFields(graph).some(
    (f) => isFieldRequired(f) && isFieldValueEmpty(f.default),
  )

// Editor-mode flow: collect values and persist them as Input defaults (Save) or
// persist-and-run (Save & Run). Returns false when there are no Input fields.
export const openInputsModal = (params: OpenInputsModalParams): boolean => {
  const form = buildInputsForm(params.graph)
  if (!form) return false

  const dialog = openDialog({
    title: 'Test inputs',
    content: form.element,
    anchor: params.anchor,
    actions: [
      { label: 'Cancel' },
      { label: 'Save', onClick: () => params.onSave(form.collectValues()) },
      {
        label: 'Save & Run',
        variant: BUTTON_VARIANT.PRIMARY,
        closeOnClick: false,
        onClick: () => {
          if (!form.validateRequired()) return
          params.onSaveAndRun(form.collectValues())
          dialog.close()
        },
      },
    ],
  })
  return true
}

// Non-editing flow: collect values and run with them, without touching the
// graph. Returns false when there are no Input fields (caller runs directly).
export const openInputsRun = (params: OpenInputsRunParams): boolean => {
  const form = buildInputsForm(params.graph)
  if (!form) return false

  const dialog = openDialog({
    title: 'Test inputs',
    content: form.element,
    anchor: params.anchor,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Run',
        variant: BUTTON_VARIANT.PRIMARY,
        closeOnClick: false,
        onClick: () => {
          if (!form.validateRequired()) return
          params.onRun(form.collectValues())
          dialog.close()
        },
      },
    ],
  })
  return true
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Form
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface InputsForm {
  element: HTMLElement
  collectValues: () => Record<string, unknown>
  // Flags empty required fields; returns false when any is unmet.
  validateRequired: () => boolean
}

const buildInputsForm = (graph: Graph): InputsForm | null => {
  const fields = collectInputFields(graph)
  if (fields.length === 0) return null

  const values = new Map<string, unknown>()
  const validators: (() => boolean)[] = []

  const element = document.createElement('div')
  element.classList.add('wf-modal-fields')

  for (const field of fields) {
    values.set(
      field.name,
      field.multiple && !Array.isArray(field.default) ? [] : field.default,
    )

    const error = createControlError()
    const wrapper = document.createElement('div')
    wrapper.appendChild(createFieldLabel({ text: field.name }))
    const control = renderFieldInput(field, values.get(field.name), (v) => {
      values.set(field.name, v)
      setControlInvalid(control, false)
      error.set(null)
    })
    control.setAttribute('aria-describedby', error.element.id)
    wrapper.append(control, error.element)
    element.appendChild(wrapper)

    validators.push(() => {
      const unmet =
        isFieldRequired(field) && isFieldValueEmpty(values.get(field.name))
      setControlInvalid(control, unmet)
      error.set(unmet ? 'Required' : null)
      return !unmet
    })
  }

  return {
    element,
    collectValues: () => Object.fromEntries(values),
    validateRequired: () => validators.map((v) => v()).every(Boolean),
  }
}

const collectInputFields = (graph: Graph): Field[] => {
  const result: Field[] = []
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== 'input') continue
    const nodeFields = node.data.fields as Field[] | undefined
    if (!Array.isArray(nodeFields)) continue
    for (const f of nodeFields) result.push(f)
  }
  return result
}

const renderFieldInput = (
  field: Field,
  initialValue: unknown,
  onChange: (value: unknown) => void,
): HTMLElement => {
  if (field.multiple) {
    return createListValueInput({
      value: Array.isArray(initialValue) ? initialValue : [],
      onChange,
      renderItem: (value, onItemChange) =>
        renderScalarInput(field.dataType, value, onItemChange),
    })
  }
  return renderScalarInput(field.dataType, initialValue, onChange)
}

const renderScalarInput = (
  dataType: string,
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement => {
  if (dataType === 'boolean') {
    return createBooleanInput({ value: Boolean(value), onChange })
  }
  if (dataType === 'number') {
    return createNumberInput({
      value: typeof value === 'number' ? value : undefined,
      onChange,
    })
  }
  if (dataType === 'json') {
    return createJsonInput({ value: value ?? '', onChange })
  }
  if (dataType === 'image') {
    return createImageInput({
      value: typeof value === 'string' ? value : '',
      onChange,
    })
  }
  return createTextInput({
    value: typeof value === 'string' ? value : '',
    onChange,
  })
}
