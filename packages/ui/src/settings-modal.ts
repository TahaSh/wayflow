import { type GraphMetadata, toSnakeCase } from '@wayflow/core'
import {
  BUTTON_VARIANT,
  createBooleanInput,
  createFieldLabel,
  createTextarea,
  createTextInput,
} from './controls'
import { openDialog } from './dialog'

interface OpenSettingsModalParams {
  metadata: GraphMetadata
  onSave: (next: GraphMetadata) => void
  anchor?: HTMLElement
}

export const openSettingsModal = (params: OpenSettingsModalParams): void => {
  const draft: GraphMetadata = {
    name: params.metadata.name,
    description: params.metadata.description,
    exposedAsTool: params.metadata.exposedAsTool,
  }

  const body = document.createElement('div')

  const nameWrapper = document.createElement('div')
  nameWrapper.appendChild(createFieldLabel({ text: 'Workflow name' }))

  const nameInput = createTextInput({
    value: draft.name ?? '',
    placeholder: 'Untitled workflow',
    onChange: (v) => {
      draft.name = v
      updateFraming()
    },
  })
  nameWrapper.appendChild(nameInput)

  const nameHelper = document.createElement('div')
  nameHelper.classList.add('wf-modal-field-helper')
  nameWrapper.appendChild(nameHelper)
  body.appendChild(nameWrapper)

  const descWrapper = document.createElement('div')
  descWrapper.appendChild(createFieldLabel({ text: 'Description' }))

  const descInput = createTextarea({
    value: draft.description ?? '',
    rows: 3,
    onChange: (v) => {
      draft.description = v
    },
  })
  descWrapper.appendChild(descInput)
  body.appendChild(descWrapper)

  const toolRow = document.createElement('label')
  toolRow.classList.add('wf-modal-checkbox-row')
  toolRow.appendChild(
    createBooleanInput({
      value: draft.exposedAsTool ?? false,
      onChange: (v) => {
        draft.exposedAsTool = v
        updateFraming()
      },
    }),
  )
  toolRow.appendChild(document.createTextNode('Available as a tool'))
  body.appendChild(toolRow)

  const updateFraming = () => {
    if (!draft.exposedAsTool) {
      nameHelper.replaceChildren()
      descInput.placeholder = 'What does this workflow do?'
      return
    }
    descInput.placeholder = 'When should an agent invoke this workflow?'
    const slug = toSnakeCase(draft.name)
    if (!slug) {
      nameHelper.textContent = 'Name this workflow so an agent can call it.'
      return
    }
    nameHelper.replaceChildren(
      document.createTextNode('Agents will call this as: '),
      Object.assign(document.createElement('code'), {
        className: 'wf-modal-field-helper-code',
        textContent: slug,
      }),
    )
  }
  updateFraming()

  openDialog({
    title: 'Workflow settings',
    content: body,
    anchor: params.anchor,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save',
        variant: BUTTON_VARIANT.PRIMARY,
        onClick: () => params.onSave(draft),
      },
    ],
  })
}
