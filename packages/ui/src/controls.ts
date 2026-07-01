import { createIcon, type IconName } from './icons'

interface InputBase {
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
}

const applyInputBase = (
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  props: InputBase,
) => {
  if (props.invalid) el.classList.add('wf-control-input-invalid')
  if (props.disabled) el.disabled = true
  if ('placeholder' in el && props.placeholder !== undefined) {
    el.placeholder = props.placeholder
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Field Label
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface FieldLabelProps {
  text: string
  htmlFor?: string
}

export const createFieldLabel = (props: FieldLabelProps): HTMLLabelElement => {
  const label = document.createElement('label')
  label.classList.add('wf-config-field-label')
  label.textContent = props.text
  if (props.htmlFor) label.htmlFor = props.htmlFor
  return label
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Text Input
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface TextInputProps extends InputBase {
  value: string
  onChange: (value: string) => void
  commitOnBlur?: boolean
}

// Fires `emit` only on blur or Enter, and only when the value changed; Escape
// reverts to the focus-time value. Shared by the text and number inputs.
const wireCommitOnBlur = (input: HTMLInputElement, emit: () => void) => {
  let original = input.value
  input.addEventListener('focus', () => {
    original = input.value
  })
  input.addEventListener('blur', () => {
    if (input.value !== original) {
      emit()
      original = input.value
    }
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      input.value = original
      input.blur()
    }
  })
}

export const createTextInput = (props: TextInputProps): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = 'text'
  input.classList.add('wf-control-input')
  applyInputBase(input, props)
  input.value = props.value ?? ''

  const emit = () => props.onChange(input.value)
  if (props.commitOnBlur) wireCommitOnBlur(input, emit)
  else input.addEventListener('input', emit)

  return input
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Textarea
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface TextareaProps extends InputBase {
  value: string
  onChange: (value: string) => void
  rows?: number
  spellcheck?: boolean
}

export const createTextarea = (props: TextareaProps): HTMLTextAreaElement => {
  const ta = document.createElement('textarea')
  ta.classList.add('wf-control-textarea')
  applyInputBase(ta, props)
  ta.value = props.value ?? ''
  ta.rows = props.rows ?? 4
  if (props.spellcheck !== undefined) ta.spellcheck = props.spellcheck
  ta.addEventListener('input', () => props.onChange(ta.value))
  return ta
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Number Input
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface NumberInputProps extends InputBase {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  commitOnBlur?: boolean
}

export const createNumberInput = (
  props: NumberInputProps,
): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = 'number'
  input.classList.add('wf-control-input')
  applyInputBase(input, props)
  if (props.min !== undefined) input.min = String(props.min)
  if (props.max !== undefined) input.max = String(props.max)
  if (props.step !== undefined) input.step = String(props.step)
  input.value = props.value == null ? '' : String(props.value)

  const emit = () =>
    props.onChange(input.value === '' ? undefined : Number(input.value))
  if (props.commitOnBlur) wireCommitOnBlur(input, emit)
  else input.addEventListener('input', emit)

  return input
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Slider
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface SliderInputProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
}

export const createSliderInput = (props: SliderInputProps): HTMLElement => {
  const container = document.createElement('div')
  container.classList.add('wf-control-slider-container')

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.classList.add('wf-control-slider')
  slider.min = String(props.min)
  slider.max = String(props.max)
  slider.step = String(props.step ?? 0.1)
  slider.value = String(props.value ?? props.min)
  if (props.disabled) slider.disabled = true

  const display = document.createElement('span')
  display.classList.add('wf-control-slider-value')
  display.textContent = slider.value

  // Track the value live while dragging, but only commit on release ('change')
  // so a drag is one config edit, not one per tick.
  slider.addEventListener('input', () => {
    display.textContent = slider.value
  })
  slider.addEventListener('change', () => {
    props.onChange(Number(slider.value))
  })

  container.append(slider, display)
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Select
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A bare string is its own label; pass an object to show a label distinct from
// the stored value (e.g. 'Text' for the 'string' data type).
export type SelectOption = string | { value: string; label: string }

interface SelectInputProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  invalid?: boolean
  disabled?: boolean
  emptyHint?: string
}

export const createSelectInput = (
  props: SelectInputProps,
): HTMLSelectElement => {
  const select = document.createElement('select')
  select.classList.add('wf-control-select')
  applyInputBase(select, props)
  if (props.options.length === 0) {
    select.disabled = true
    const placeholder = document.createElement('option')
    placeholder.textContent = props.emptyHint ?? ''
    placeholder.selected = true
    select.appendChild(placeholder)
    return select
  }
  for (const opt of props.options) {
    const { value, label } =
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    const optionEl = document.createElement('option')
    optionEl.value = value
    optionEl.textContent = label
    optionEl.selected = value === props.value
    select.appendChild(optionEl)
  }
  select.addEventListener('change', () => props.onChange(select.value))
  return select
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Boolean (Checkbox)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface BooleanInputProps {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export const createBooleanInput = (
  props: BooleanInputProps,
): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.classList.add('wf-control-checkbox')
  if (props.disabled) input.disabled = true
  input.checked = props.value ?? false
  input.addEventListener('change', () => props.onChange(input.checked))
  return input
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Segmented Control
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface SegmentOption {
  label: string
  value: string
}

interface SegmentedControlProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
}

export const createSegmentedControl = (
  props: SegmentedControlProps,
): HTMLElement => {
  const seg = document.createElement('div')
  seg.classList.add('wf-seg')

  let current = props.value
  const buttons: { el: HTMLButtonElement; value: string }[] = []
  // Tracks active state internally so a value change doesn't need a re-render.
  const sync = () => {
    for (const { el, value } of buttons) {
      if (value === current) el.dataset.active = 'true'
      else delete el.dataset.active
    }
  }

  for (const option of props.options) {
    const el = document.createElement('button')
    el.type = 'button'
    el.classList.add('wf-seg__btn')
    el.textContent = option.label
    el.addEventListener('click', () => {
      current = option.value
      sync()
      props.onChange(option.value)
    })
    buttons.push({ el, value: option.value })
    seg.appendChild(el)
  }

  sync()
  return seg
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  JSON (Textarea variant)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface JsonInputProps extends InputBase {
  value: string | unknown
  onChange: (value: string) => void
  rows?: number
}

export const createJsonInput = (props: JsonInputProps): HTMLTextAreaElement => {
  const ta = document.createElement('textarea')
  ta.classList.add('wf-control-textarea', 'wf-control-json')
  applyInputBase(ta, props)
  ta.value =
    typeof props.value === 'string'
      ? props.value
      : JSON.stringify(props.value, null, 2)
  ta.rows = props.rows ?? 6
  ta.spellcheck = false
  ta.addEventListener('input', () => props.onChange(ta.value))
  return ta
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Value Displays
//
//  The read-only siblings of the inputs above: render a committed value as
//  static, selectable text instead of an editable control.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ValueDisplayProps {
  multiline?: boolean
  mono?: boolean
}

export const createValueDisplay = (
  text: string,
  props: ValueDisplayProps = {},
): HTMLDivElement => {
  const el = document.createElement('div')
  el.classList.add('wf-config-value')
  if (props.multiline) el.classList.add('wf-config-value-multiline')
  if (props.mono) el.classList.add('wf-config-value-mono')
  if (text.trim() === '') {
    el.classList.add('wf-config-value-empty')
    el.textContent = '—'
  } else {
    el.textContent = text
  }
  return el
}

// Pretty-prints a JSON value (or shows a raw string verbatim) in a mono block.
export const createJsonValueDisplay = (value: unknown): HTMLDivElement => {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return createValueDisplay(text ?? '', { multiline: true, mono: true })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Button
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const BUTTON_VARIANT = {
  DEFAULT: 'default',
  PRIMARY: 'primary',
  DANGER: 'danger',
} as const

export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT]

interface ButtonProps {
  label: string
  onClick: () => void
  variant?: ButtonVariant
  disabled?: boolean
  title?: string
  icon?: IconName
  iconSize?: number
}

export const createButton = (props: ButtonProps): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.add('wf-control-button')
  if (props.variant === BUTTON_VARIANT.PRIMARY) {
    button.classList.add('wf-control-button-primary')
  } else if (props.variant === BUTTON_VARIANT.DANGER) {
    button.classList.add('wf-control-button-danger')
  }
  if (props.icon) {
    button.appendChild(
      createIcon({ name: props.icon, size: props.iconSize ?? 12 }),
    )
  }
  button.appendChild(document.createTextNode(props.label))
  if (props.title) button.title = props.title
  if (props.disabled) button.disabled = true
  button.addEventListener('click', props.onClick)
  return button
}

export interface IconButtonParams {
  icon: IconName
  label: string
  onClick: () => void
  size?: number
}

export const createIconButton = ({
  icon,
  label,
  onClick,
  size = 13,
}: IconButtonParams): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.add('wf-icon-button')
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(createIcon({ name: icon, size }))
  button.addEventListener('click', onClick)
  return button
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Badge
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const TONE = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  MUTED: 'muted',
} as const

export type Tone = (typeof TONE)[keyof typeof TONE]

interface BadgeProps {
  tone: Tone
  label: string
  suffix?: string
  dot?: boolean
  onClick?: () => void
}

export const createBadge = (props: BadgeProps): HTMLElement => {
  const badge = document.createElement(props.onClick ? 'button' : 'div')
  badge.classList.add('wf-control-badge', `wf-control-badge-${props.tone}`)
  if (props.onClick) {
    ;(badge as HTMLButtonElement).type = 'button'
    badge.classList.add('wf-control-badge-clickable')
    badge.addEventListener('click', props.onClick)
  }

  if (props.dot) {
    const dot = document.createElement('span')
    dot.classList.add('wf-control-badge-dot')
    badge.appendChild(dot)
  }

  const label = document.createElement('span')
  label.classList.add('wf-control-badge-label')
  label.textContent = props.label
  badge.appendChild(label)

  if (props.suffix) {
    const suffix = document.createElement('span')
    suffix.classList.add('wf-control-badge-suffix')
    suffix.textContent = props.suffix
    badge.appendChild(suffix)
  }

  return badge
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Alert
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface AlertProps {
  tone: Tone
  text: string
  code?: string
  hint?: string
  docsUrl?: string
}

export const createAlert = (props: AlertProps): HTMLDivElement => {
  const alert = document.createElement('div')
  alert.classList.add('wf-control-alert', `wf-control-alert-${props.tone}`)

  const textEl = document.createElement('div')
  textEl.classList.add('wf-control-alert-text')
  textEl.textContent = props.text
  alert.appendChild(textEl)

  if (props.hint) {
    const hintEl = document.createElement('div')
    hintEl.classList.add('wf-control-alert-hint')
    hintEl.textContent = props.hint
    alert.appendChild(hintEl)
  }

  if (props.docsUrl) {
    const linkEl = document.createElement('a')
    linkEl.classList.add('wf-control-alert-link')
    linkEl.href = props.docsUrl
    linkEl.target = '_blank'
    linkEl.rel = 'noopener noreferrer'
    linkEl.textContent = 'Learn more →'
    alert.appendChild(linkEl)
  }

  if (props.code) {
    const codeEl = document.createElement('div')
    codeEl.classList.add('wf-control-alert-code')
    codeEl.textContent = props.code
    alert.appendChild(codeEl)
  }

  return alert
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Copy Button
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CopyButtonProps {
  getText: () => string
  label?: string
  flashMs?: number
}

const DEFAULT_COPY_FLASH_MS = 1500

export const createCopyButton = (props: CopyButtonProps): HTMLButtonElement => {
  const label = props.label ?? 'Copy'
  const flashMs = props.flashMs ?? DEFAULT_COPY_FLASH_MS

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('wf-control-copy')

  const setLabel = (text: string) => {
    btn.replaceChildren(
      createIcon({ name: 'copy', size: 11 }),
      document.createTextNode(text),
    )
  }
  setLabel(label)

  const flash = (text: string, cls: string) => {
    setLabel(text)
    btn.classList.add(cls)
    setTimeout(() => {
      setLabel(label)
      btn.classList.remove(cls)
    }, flashMs)
  }

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(props.getText())
      flash('Copied', 'wf-control-copy-success')
    } catch {
      flash('Copy failed', 'wf-control-copy-failure')
    }
  })

  return btn
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  State Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const setControlInvalid = (
  el: HTMLElement,
  invalid: boolean,
  message?: string,
): void => {
  el.classList.toggle('wf-control-input-invalid', invalid)
  el.setAttribute('aria-invalid', String(invalid))
  if (invalid && message) {
    el.title = message
  } else {
    el.removeAttribute('title')
  }
}

let controlErrorSeq = 0

export interface ControlError {
  element: HTMLElement
  set: (message: string | null) => void
}

// An inline validation message. Pair its `element.id` with a control's
// aria-describedby, and drive it alongside setControlInvalid.
export const createControlError = (): ControlError => {
  const element = document.createElement('p')
  element.classList.add('wf-control-error')
  element.id = `wf-control-error-${controlErrorSeq++}`
  element.hidden = true
  return {
    element,
    set: (message) => {
      element.textContent = message ?? ''
      element.hidden = message === null
    },
  }
}

export const setControlDisabled = (
  el: HTMLElement & { disabled?: boolean },
  disabled: boolean,
): void => {
  el.classList.toggle('wf-control-disabled', disabled)
  if ('disabled' in el) el.disabled = disabled
}
