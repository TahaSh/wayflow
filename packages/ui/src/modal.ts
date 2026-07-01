import { BUTTON_VARIANT, type ButtonVariant, createButton } from './controls'
import { type OverlayMount, resolveOverlayMount } from './shell'

export interface ModalAction {
  label: string
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  closeOnClick?: boolean // default true
}

export interface CreateModalParams {
  title: string
  content: HTMLElement
  // The last 'primary' action is bound to Enter for keyboard submit.
  actions?: ModalAction[]
  anchor?: HTMLElement
  // Where to attach the overlay (default 'shell'); see OverlayMount.
  mount?: OverlayMount
}

export interface ModalHandle {
  element: HTMLElement
  open: () => void
  close: () => void
  destroy: () => void
}

export const createModal = (params: CreateModalParams): ModalHandle => {
  const backdrop = document.createElement('div')
  backdrop.classList.add('wf-modal-backdrop')

  const modal = document.createElement('div')
  modal.classList.add('wf-modal')
  modal.addEventListener('pointerdown', (e) => e.stopPropagation())

  const header = document.createElement('div')
  header.classList.add('wf-modal-header')
  header.textContent = params.title
  modal.appendChild(header)

  const body = document.createElement('div')
  body.classList.add('wf-modal-body')
  body.appendChild(params.content)
  modal.appendChild(body)

  let primaryAction: ModalAction | undefined
  if (params.actions?.length) {
    const footer = document.createElement('div')
    footer.classList.add('wf-modal-footer')

    for (const action of params.actions) {
      if (action.variant === BUTTON_VARIANT.PRIMARY) primaryAction = action
      footer.appendChild(
        createButton({
          label: action.label,
          variant: action.variant,
          disabled: action.disabled,
          onClick: () => {
            action.onClick?.()
            if (action.closeOnClick !== false) close()
          },
        }),
      )
    }

    modal.appendChild(footer)
  }

  backdrop.appendChild(modal)

  let isOpen = false

  // Only close if the user actually pressed AND released on the backdrop —
  // a drag that starts inside the modal and ends outside should not close it.
  let pointerDownTarget: EventTarget | null = null
  backdrop.addEventListener('pointerdown', (e) => {
    pointerDownTarget = e.target
  })
  backdrop.addEventListener('click', (e) => {
    if (pointerDownTarget === backdrop && e.target === backdrop) close()
    pointerDownTarget = null
  })

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
    } else if (
      e.key === 'Enter' &&
      primaryAction &&
      !primaryAction.disabled &&
      !(document.activeElement instanceof HTMLTextAreaElement)
    ) {
      primaryAction.onClick?.()
      if (primaryAction.closeOnClick !== false) close()
    }
  }

  const open = () => {
    if (isOpen) return
    resolveOverlayMount(params.mount, params.anchor).appendChild(backdrop)
    document.addEventListener('keydown', onKeydown)
    isOpen = true
    const firstField = body.querySelector<HTMLElement>(
      'input, select, textarea, button',
    )
    firstField?.focus({ preventScroll: true })
  }

  const close = () => {
    if (!isOpen) return
    document.removeEventListener('keydown', onKeydown)
    backdrop.remove()
    isOpen = false
  }

  const destroy = () => {
    close()
  }

  return {
    element: backdrop,
    open,
    close,
    destroy,
  }
}
