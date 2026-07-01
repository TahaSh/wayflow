import { createAnchoredOverlay } from './anchored-overlay'
import { createButton, createTextInput } from './controls'
import { createIcon, type IconName } from './icons'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const IMAGE_INPUT_CONTEXT = {
  // Full inline editor — test-inputs modal / wide sidebar.
  FULL: 'full',
  // Compact trigger that opens the editor in a popover — narrow Fields cell.
  COMPACT: 'compact',
} as const

export type ImageInputContext =
  (typeof IMAGE_INPUT_CONTEXT)[keyof typeof IMAGE_INPUT_CONTEXT]

// Where the value came from, derived from the string itself.
const SOURCE = {
  EMPTY: 'empty',
  UPLOAD: 'upload',
  URL: 'url',
} as const

type Source = (typeof SOURCE)[keyof typeof SOURCE]

// Display-only load state for URL values (uploads are always ready).
const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  ERROR: 'error',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ImageInputProps {
  value: string
  onChange: (value: string) => void
  context?: ImageInputContext
}

interface UploadMeta {
  name: string
  size: number
}

export const createImageInput = (props: ImageInputProps): HTMLElement => {
  const context = props.context ?? IMAGE_INPUT_CONTEXT.FULL

  const container = document.createElement('div')
  container.classList.add('wf-image-input')

  let value = props.value ?? ''
  let status: Status = STATUS.IDLE
  let uploadMeta: UploadMeta | null = null

  const upload = (file: File) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      set(String(reader.result), { name: file.name, size: file.size }),
    )
    reader.readAsDataURL(file)
  }

  // One hidden picker, reused across re-renders.
  const fileInput = createFilePicker(upload)
  container.appendChild(fileInput)

  // Probe a URL so we can show loading/error without altering the value, which
  // always reflects exactly what was set (display state is never the contract).
  const probe = (url: string) => {
    status = STATUS.LOADING
    renderAll()
    const img = new Image()
    const settle = (next: Status) => {
      if (value === url) {
        status = next
        renderAll()
      }
    }
    img.addEventListener('load', () => settle(STATUS.IDLE))
    img.addEventListener('error', () => settle(STATUS.ERROR))
    img.src = url
  }

  const set = (next: string, meta: UploadMeta | null = null): void => {
    value = next
    uploadMeta = meta
    status = STATUS.IDLE
    props.onChange(next)
    if (next && sourceOf(next) === SOURCE.URL) probe(next)
    else renderAll()
  }

  // The full editor for the current state — rendered inline in the full
  // context, and inside the popover in the compact context.
  const buildEditor = (): HTMLElement =>
    sourceOf(value) === SOURCE.EMPTY
      ? createEmptyEditor({
          onPickFile: () => fileInput.click(),
          onDropImage: upload,
          onCommitUrl: set,
        })
      : createFilledEditor({
          value,
          status,
          source: sourceOf(value),
          metaText: metaText(value, status, uploadMeta),
          onPickFile: () => fileInput.click(),
          onUseUrl: () => set(''),
          onRemove: () => set(''),
          onCommitUrl: set,
          onRetry: () => probe(value),
        })

  // Paste an image straight from the clipboard; text paste falls through to the
  // URL field untouched.
  const onPaste = (e: ClipboardEvent) => {
    const file = imageFromClipboard(e.clipboardData)
    if (!file) return
    e.preventDefault()
    upload(file)
  }
  container.addEventListener('paste', onPaste)

  // Compact context renders a trigger; the editor lives in a popover whose body
  // is refilled on every state change.
  const trigger = document.createElement('div')
  trigger.classList.add('wf-img-trigger')

  const popoverBody = document.createElement('div')
  popoverBody.classList.add('wf-img-popover__body')

  const popoverEl = document.createElement('div')
  popoverEl.classList.add('wf-popover', 'wf-img-popover')
  popoverEl.append(
    createPopoverHeader(() => popover.close()),
    popoverBody,
  )
  // The popover mounts at the shell root, outside `container`, so it needs its
  // own paste listener.
  popoverEl.addEventListener('paste', onPaste)

  const popover = createAnchoredOverlay({
    anchor: trigger,
    content: popoverEl,
    align: 'left',
  })

  function renderAll(): void {
    if (context === IMAGE_INPUT_CONTEXT.FULL) {
      container.replaceChildren(fileInput, buildEditor())
      return
    }
    trigger.replaceChildren(
      createMiniTrigger({
        value,
        status,
        source: sourceOf(value),
        label: triggerLabel(value, status, uploadMeta),
      }),
    )
    popoverBody.replaceChildren(buildEditor())
  }

  if (context === IMAGE_INPUT_CONTEXT.COMPACT) {
    container.appendChild(trigger)
    trigger.addEventListener('click', () => popover.toggle())
  }

  renderAll()
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Empty editor (dropzone + URL)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface EmptyEditorProps {
  onPickFile: () => void
  onDropImage: (file: File) => void
  onCommitUrl: (url: string) => void
}

const createEmptyEditor = (props: EmptyEditorProps): HTMLElement => {
  const editor = document.createElement('div')
  editor.classList.add('wf-img')

  const divider = document.createElement('span')
  divider.classList.add('wf-img__or')
  divider.textContent = 'or paste a link'

  editor.append(
    createDropzone(props.onPickFile, props.onDropImage),
    divider,
    createUrlField({ value: '', onCommit: props.onCommitUrl }),
  )
  return editor
}

const createDropzone = (
  onPick: () => void,
  onDropImage: (file: File) => void,
): HTMLElement => {
  const drop = document.createElement('div')
  drop.classList.add('wf-img__drop')
  drop.tabIndex = 0

  const icon = document.createElement('span')
  icon.classList.add('wf-img__drop-icon')
  icon.appendChild(createIcon({ name: 'arrow-up-tray', size: 18 }))

  const title = document.createElement('span')
  title.classList.add('wf-img__drop-title')
  title.append('Drag an image here, or ')
  const browse = document.createElement('b')
  browse.textContent = 'browse files'
  title.appendChild(browse)

  const hint = document.createElement('span')
  hint.classList.add('wf-img__drop-hint')
  hint.textContent = 'PNG, JPG, SVG, WebP · stored inline'

  drop.append(icon, title, hint)

  drop.addEventListener('click', onPick)
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick()
    }
  })
  drop.addEventListener('dragover', (e) => {
    e.preventDefault()
    drop.dataset.drag = 'true'
  })
  drop.addEventListener('dragleave', () => delete drop.dataset.drag)
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    delete drop.dataset.drag
    const file = firstImage(e.dataTransfer?.files ?? null)
    if (file) onDropImage(file)
  })
  return drop
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Filled editor (thumbnail + body)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface FilledEditorProps {
  value: string
  status: Status
  source: Source
  metaText: string
  onPickFile: () => void
  onUseUrl: () => void
  onRemove: () => void
  onCommitUrl: (url: string) => void
  onRetry: () => void
}

const createFilledEditor = (props: FilledEditorProps): HTMLElement => {
  const editor = document.createElement('div')
  editor.classList.add('wf-img')

  const filled = document.createElement('div')
  filled.classList.add('wf-img__filled')
  filled.append(createThumb(props.value, props.status), createBody(props))

  editor.appendChild(filled)
  return editor
}

const createBody = (props: FilledEditorProps): HTMLElement => {
  const body = document.createElement('div')
  body.classList.add('wf-img__body')

  const isError = props.status === STATUS.ERROR
  const isUrl = props.source === SOURCE.URL

  const head = document.createElement('div')
  head.classList.add('wf-img__bodyhead')
  head.appendChild(createSourceBadge(isError ? 'error' : props.source))
  if (!isError) {
    const meta = document.createElement('span')
    meta.classList.add('wf-img__meta')
    meta.textContent = props.metaText
    head.appendChild(meta)
  }
  body.appendChild(head)

  // A URL value stays editable while filled (and during error) — uploads don't.
  if (isUrl) {
    body.appendChild(
      createUrlField({
        value: props.value,
        error: isError,
        onCommit: props.onCommitUrl,
      }),
    )
  }

  if (isError) {
    body.appendChild(
      createErrorMessage(
        "Couldn't load image — check the URL, or upload a file",
      ),
    )
  }

  body.appendChild(createActions(props))
  return body
}

const createActions = (props: FilledEditorProps): HTMLElement => {
  const actions = document.createElement('div')
  actions.classList.add('wf-img__actions')

  if (props.status === STATUS.LOADING) {
    const note = document.createElement('span')
    note.classList.add('wf-img__meta')
    note.textContent = 'Fetching image…'
    actions.appendChild(note)
    return actions
  }

  if (props.status === STATUS.ERROR) {
    actions.append(
      createButton({ label: 'Retry', icon: 'loader', onClick: props.onRetry }),
      createButton({
        label: 'Upload a file',
        icon: 'arrow-up-tray',
        onClick: props.onPickFile,
      }),
    )
    return actions
  }

  if (props.source === SOURCE.URL) {
    actions.append(
      createButton({
        label: 'Upload a file',
        icon: 'arrow-up-tray',
        onClick: props.onPickFile,
      }),
      createRemoveButton(props.onRemove),
    )
  } else {
    actions.append(
      createButton({
        label: 'Replace',
        icon: 'arrow-up-tray',
        onClick: props.onPickFile,
      }),
      createButton({
        label: 'Use URL instead',
        icon: 'link',
        onClick: props.onUseUrl,
      }),
      createRemoveButton(props.onRemove),
    )
  }
  return actions
}

const createThumb = (value: string, status: Status): HTMLElement => {
  const thumb = document.createElement('div')
  thumb.classList.add('wf-img__thumb')

  if (status === STATUS.LOADING) {
    thumb.dataset.state = 'loading'
    const spinner = document.createElement('span')
    spinner.classList.add('wf-img__spinner')
    thumb.appendChild(spinner)
  } else if (status === STATUS.ERROR) {
    thumb.dataset.state = 'error'
    thumb.appendChild(createIcon({ name: 'alert-triangle', size: 20 }))
  } else {
    const img = document.createElement('img')
    img.classList.add('wf-img__thumb-img')
    img.src = value
    img.alt = ''
    thumb.appendChild(img)
  }
  return thumb
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Compact trigger + popover
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface MiniTriggerProps {
  value: string
  status: Status
  source: Source
  label: string
}

const createMiniTrigger = (props: MiniTriggerProps): HTMLElement => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('wf-img-mini')

  if (props.source === SOURCE.EMPTY) {
    btn.classList.add('wf-img-mini--empty')
    btn.append(createIcon({ name: 'arrow-up-tray', size: 13 }), 'Set image')
    return btn
  }

  if (props.status === STATUS.ERROR) {
    btn.classList.add('wf-img-mini--error')
    const badge = document.createElement('span')
    badge.classList.add('wf-img-mini__thumb', 'wf-img-mini__thumb--error')
    badge.appendChild(createIcon({ name: 'alert-triangle', size: 12 }))
    btn.append(badge, miniLabel('Load failed'), createChevron())
    return btn
  }

  const thumb = document.createElement('span')
  thumb.classList.add('wf-img-mini__thumb')
  const img = document.createElement('img')
  img.src = props.value
  img.alt = ''
  thumb.appendChild(img)

  const dot = document.createElement('span')
  dot.classList.add('wf-img-mini__dot')
  dot.dataset.src = props.source

  btn.append(thumb, miniLabel(props.label), dot, createChevron())
  return btn
}

const miniLabel = (text: string): HTMLElement => {
  const label = document.createElement('span')
  label.classList.add('wf-img-mini__label')
  label.textContent = text
  return label
}

const createChevron = (): HTMLElement => {
  const chev = document.createElement('span')
  chev.classList.add('wf-img-mini__chev')
  chev.appendChild(createIcon({ name: 'chevron-down', size: 13 }))
  return chev
}

const createPopoverHeader = (onClose: () => void): HTMLElement => {
  const head = document.createElement('div')
  head.classList.add('wf-img-popover__hd')

  const title = document.createElement('span')
  title.classList.add('wf-img-popover__title')
  title.textContent = 'Edit image'

  const close = createButton({
    label: '',
    icon: 'x',
    iconSize: 13,
    title: 'Close',
    onClick: onClose,
  })
  close.classList.add('wf-img-popover__close')

  head.append(title, close)
  return head
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Shared pieces
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface UrlFieldProps {
  value: string
  error?: boolean
  onCommit: (url: string) => void
}

const createUrlField = (props: UrlFieldProps): HTMLElement => {
  const group = document.createElement('span')
  group.classList.add('wf-input-group')

  const icon = document.createElement('span')
  icon.classList.add('wf-input-group__icon')
  icon.appendChild(createIcon({ name: 'link', size: 13 }))

  const input = createTextInput({
    value: props.value,
    placeholder: 'Paste image URL…',
    commitOnBlur: true,
    onChange: props.onCommit,
  })
  if (props.error) input.classList.add('wf-control-input-invalid')

  // Enter commits the URL (and loads it); Escape cancels the edit. Keep both
  // local so they don't bubble to the modal's submit or the popover's close.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') e.stopPropagation()
  })

  group.append(icon, input)
  return group
}

const createSourceBadge = (source: Source | 'error'): HTMLElement => {
  const badge = document.createElement('span')
  badge.classList.add('wf-img-src')
  badge.dataset.src = source

  const icon: IconName =
    source === 'upload'
      ? 'arrow-up-tray'
      : source === 'error'
        ? 'alert-triangle'
        : 'link'
  const label =
    source === 'upload' ? 'Uploaded' : source === 'error' ? 'Failed' : 'URL'

  badge.append(createIcon({ name: icon, size: 11 }), label)
  return badge
}

const createErrorMessage = (text: string): HTMLElement => {
  const msg = document.createElement('div')
  msg.classList.add('wf-img__err-msg')
  msg.append(createIcon({ name: 'alert-triangle', size: 12 }), text)
  return msg
}

const createRemoveButton = (onRemove: () => void): HTMLElement => {
  const btn = createButton({ label: 'Remove', icon: 'x', onClick: onRemove })
  btn.classList.add('wf-img__remove')
  return btn
}

const createFilePicker = (onFile: (file: File) => void): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.hidden = true
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) onFile(file)
  })
  return input
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Value helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const sourceOf = (value: string): Source =>
  !value ? SOURCE.EMPTY : value.startsWith('data:') ? SOURCE.UPLOAD : SOURCE.URL

const metaText = (
  value: string,
  status: Status,
  meta: UploadMeta | null,
): string => {
  if (status === STATUS.LOADING) return 'Loading…'
  if (sourceOf(value) === SOURCE.UPLOAD) {
    return meta ? `${meta.name} · ${formatSize(meta.size)}` : 'Uploaded image'
  }
  return hostnameOf(value)
}

const triggerLabel = (
  value: string,
  status: Status,
  meta: UploadMeta | null,
): string => {
  if (sourceOf(value) === SOURCE.UPLOAD) return meta?.name ?? 'Uploaded image'
  if (status === STATUS.LOADING) return 'Loading…'
  return hostnameOf(value)
}

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const firstImage = (files: FileList | null): File | null =>
  Array.from(files ?? []).find((f) => f.type.startsWith('image/')) ?? null

const imageFromClipboard = (data: DataTransfer | null): File | null => {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
