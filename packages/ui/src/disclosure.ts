import { createIcon } from './icons'

export interface DisclosureParams {
  header: HTMLElement
  content: HTMLElement
  expanded?: boolean
  onToggle?: (expanded: boolean) => void
}

export interface DisclosureHandle {
  element: HTMLElement
  setExpanded: (expanded: boolean) => void
  isExpanded: () => boolean
}

// A button that shows/hides a region (the ARIA disclosure pattern). Callers style
// the `.wf-disclosure-*` parts; collapsed unless `expanded` is set.
export const createDisclosure = (
  params: DisclosureParams,
): DisclosureHandle => {
  const { header, content, onToggle } = params

  const element = document.createElement('div')
  element.classList.add('wf-disclosure')

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.classList.add('wf-disclosure-trigger')
  trigger.appendChild(header)

  const chevron = document.createElement('span')
  chevron.classList.add('wf-disclosure-chevron')
  chevron.appendChild(createIcon({ name: 'chevron-down', size: 14 }))
  trigger.appendChild(chevron)

  const region = document.createElement('div')
  region.classList.add('wf-disclosure-content')
  region.appendChild(content)

  element.append(trigger, region)

  const isExpanded = () => element.dataset.expanded === 'true'

  const setExpanded = (expanded: boolean) => {
    element.dataset.expanded = String(expanded)
    trigger.setAttribute('aria-expanded', String(expanded))
  }

  trigger.addEventListener('click', () => {
    const next = !isExpanded()
    setExpanded(next)
    onToggle?.(next)
  })

  setExpanded(params.expanded ?? false)

  return { element, setExpanded, isExpanded }
}
