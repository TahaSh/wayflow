import {
  BUTTON_VARIANT,
  createBadge,
  createButton,
  createTextarea,
  TONE,
} from './controls'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Approval card (human-in-the-loop review)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const isImageDataUri = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/')

interface ReviewField {
  element: HTMLElement
  getValue: () => unknown
}

// Renders the reviewed value for editing: text edits in a textarea; an image
// previews read-only; anything else edits as JSON and parses back on approve.
const createReviewField = (data: unknown): ReviewField => {
  if (isImageDataUri(data)) {
    const img = document.createElement('img')
    img.classList.add('wf-approval-image')
    img.src = data
    return { element: img, getValue: () => data }
  }

  const isText = typeof data === 'string'
  const textarea = createTextarea({
    value: isText ? data : JSON.stringify(data, null, 2),
    rows: 8,
    spellcheck: isText,
    onChange: () => {},
  })
  const getValue = (): unknown => {
    if (isText) return textarea.value
    try {
      return JSON.parse(textarea.value)
    } catch {
      return textarea.value
    }
  }
  return { element: textarea, getValue }
}

interface HeaderProps {
  title: string
}

const createCardHeader = ({ title }: HeaderProps): HTMLElement => {
  const header = document.createElement('div')
  header.classList.add('wf-approval-header')
  const titleEl = document.createElement('span')
  titleEl.classList.add('wf-approval-title')
  titleEl.textContent = title
  header.append(
    titleEl,
    createBadge({ tone: TONE.WARNING, label: 'Waiting', dot: true }),
  )
  return header
}

interface FooterProps {
  onReject: () => void
  onApprove: () => void
}

const createCardFooter = ({
  onReject,
  onApprove,
}: FooterProps): HTMLElement => {
  const footer = document.createElement('div')
  footer.classList.add('wf-approval-footer')
  footer.append(
    createButton({
      label: 'Reject',
      variant: BUTTON_VARIANT.DANGER,
      onClick: onReject,
    }),
    createButton({
      label: 'Approve',
      variant: BUTTON_VARIANT.PRIMARY,
      onClick: onApprove,
    }),
  )
  return footer
}

export interface ApprovalCardParams {
  title: string
  instructions: string
  data: unknown
  // Receives the (possibly edited) review value.
  onApprove: (data: unknown) => void
  onReject: () => void
}

export interface ApprovalCardHandle {
  element: HTMLElement
  destroy: () => void
}

export const createApprovalCard = (
  params: ApprovalCardParams,
): ApprovalCardHandle => {
  const card = document.createElement('div')
  card.classList.add('wf-approval-card')
  card.addEventListener('pointerdown', (e) => e.stopPropagation())
  // Keep wheel events off the canvas so scrolling the review text doesn't zoom.
  card.addEventListener('wheel', (e) => e.stopPropagation())

  const review = createReviewField(params.data)

  const instructions = document.createElement('p')
  instructions.classList.add('wf-approval-instructions')
  instructions.textContent =
    params.instructions || 'Review and approve to continue.'

  const reviewLabel = document.createElement('div')
  reviewLabel.classList.add('wf-approval-review-label')
  reviewLabel.textContent = 'Review'

  card.append(
    createCardHeader({ title: params.title }),
    instructions,
    reviewLabel,
    review.element,
    createCardFooter({
      onReject: params.onReject,
      onApprove: () => params.onApprove(review.getValue()),
    }),
  )

  return { element: card, destroy: () => card.remove() }
}
