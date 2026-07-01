import {
  FIELD_FORMAT,
  FIELD_FORMATS,
  type Field,
  isTruncatedValue,
  REVIEW_DECISION,
  type ReviewDecision,
  type RunDataEntry,
  TOOL_CALL_STATUS,
  type ToolCallEntry,
  type ToolCallStatus,
} from '@wayflow/agent'
import { formatDuration, NODE_STATUS, type NodeStatus } from '@wayflow/core'
import {
  createAlert,
  createBadge,
  createCopyButton,
  createSelectInput,
  TONE,
  type Tone,
} from './controls'
import { createDisclosure } from './disclosure'
import { createIcon } from './icons'
import { createJsonTree } from './json-tree'
import { createListReconciler, type UpdatableView } from './view'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ResultFieldMeta {
  name: string
  dataType: string
  format?: string
}

// Returns nothing to fall back to the default block; a string renders as plain
// text — return an element for rich/HTML output (the host owns sanitisation).
export type RenderResultField = (
  value: unknown,
  meta: ResultFieldMeta,
) => HTMLElement | string | undefined

// A returned string is inserted as HTML.
export type RenderMarkdown = (md: string) => string | HTMLElement

// Live preview switch — persists a field's display format back to the node.
type FormatChange = (fieldName: string, format: string) => void

interface CreateResultPanelParams {
  container: HTMLElement
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  onConfigChange?: (params: {
    nodeId: string
    key: string
    newValue: unknown
  }) => void
}

export interface ResultShowParams {
  entry: RunDataEntry
  nodeId?: string
  nodeType?: string
  nodeConfig?: Record<string, unknown>
}

export interface ResultPanelHandle {
  element: HTMLElement
  show: (params: ResultShowParams) => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Status Mapping
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const STATUS_LABEL: Record<NodeStatus, string> = {
  [NODE_STATUS.IDLE]: 'Idle',
  [NODE_STATUS.RUNNING]: 'Running…',
  [NODE_STATUS.COMPLETE]: 'Complete',
  [NODE_STATUS.ERROR]: 'Error',
  [NODE_STATUS.SKIPPED]: 'Skipped',
  [NODE_STATUS.CANCELLED]: 'Cancelled',
  [NODE_STATUS.WAITING]: 'Waiting…',
}

const STATUS_TONE: Record<NodeStatus, Tone> = {
  [NODE_STATUS.IDLE]: TONE.MUTED,
  [NODE_STATUS.RUNNING]: TONE.INFO,
  [NODE_STATUS.COMPLETE]: TONE.SUCCESS,
  [NODE_STATUS.ERROR]: TONE.ERROR,
  [NODE_STATUS.SKIPPED]: TONE.MUTED,
  [NODE_STATUS.CANCELLED]: TONE.MUTED,
  [NODE_STATUS.WAITING]: TONE.WARNING,
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Value Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const formatSize = (chars: number): string => {
  return `${(chars / 1024).toFixed(1)} KB`
}

const stringifyForCopy = (value: unknown): string => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Panel Root
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createPanelRoot = (): HTMLDivElement => {
  const root = document.createElement('div')
  root.classList.add('wf-result-panel')
  return root
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Status Pill
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface StatusPillProps {
  status: NodeStatus
  durationMs?: number
}

const createStatusPill = ({
  status,
  durationMs,
}: StatusPillProps): HTMLElement => {
  const suffix =
    status === NODE_STATUS.COMPLETE && typeof durationMs === 'number'
      ? `· ${formatDuration(durationMs)}`
      : undefined
  return createBadge({
    tone: STATUS_TONE[status],
    label: STATUS_LABEL[status],
    suffix,
    dot: true,
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Section
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Body and copy target swap after creation, so run data updates in place instead
// of rebuilding the section on every change.
interface SectionShell {
  element: HTMLDivElement
  setBody: (body: HTMLElement) => void
  setCopyData: (data: unknown) => void
  setVisible: (visible: boolean) => void
}

const createSectionShell = (title: string): SectionShell => {
  const section = document.createElement('div')
  section.classList.add('wf-result-section')

  let copyData: unknown
  const header = document.createElement('div')
  header.classList.add('wf-result-section-header')

  const titleEl = document.createElement('div')
  titleEl.classList.add('wf-result-section-title')
  titleEl.textContent = title
  header.appendChild(titleEl)

  header.appendChild(
    createCopyButton({ getText: () => stringifyForCopy(copyData) }),
  )
  section.appendChild(header)

  const bodyEl = document.createElement('div')
  bodyEl.classList.add('wf-result-section-body')
  section.appendChild(bodyEl)

  return {
    element: section,
    setBody: (body) => bodyEl.replaceChildren(body),
    setCopyData: (data) => {
      copyData = data
    },
    setVisible: (visible) => {
      section.style.display = visible ? '' : 'none'
    },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Truncated Caption
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface TruncatedCaptionProps {
  size: number
}

const createTruncatedCaption = ({
  size,
}: TruncatedCaptionProps): HTMLDivElement => {
  const caption = document.createElement('div')
  caption.classList.add('wf-result-truncated')
  caption.textContent = `(truncated, ${formatSize(size)})`
  return caption
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Value Block
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ValueBlockProps {
  value: unknown
}

const createValueBlock = ({ value }: ValueBlockProps): HTMLDivElement => {
  const wrap = document.createElement('div')
  wrap.classList.add('wf-result-value')

  if (isTruncatedValue(value)) {
    const preview = document.createElement('div')
    preview.classList.add('wf-result-value-text')
    preview.textContent = value.preview
    wrap.appendChild(preview)
    wrap.appendChild(createTruncatedCaption({ size: value.size }))
    return wrap
  }

  if (typeof value === 'string') {
    const text = document.createElement('div')
    text.classList.add('wf-result-value-text')
    text.textContent = value
    wrap.appendChild(text)
    return wrap
  }

  wrap.appendChild(createJsonTree(value))
  return wrap
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Field Rows (inputs + outputs)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ResultValueProps {
  value: unknown
  meta?: ResultFieldMeta
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
}

const createValueWrapper = (child: HTMLElement): HTMLDivElement => {
  const wrap = document.createElement('div')
  wrap.classList.add('wf-result-value')
  wrap.appendChild(child)
  return wrap
}

const createMarkdownEl = (rendered: string | HTMLElement): HTMLElement => {
  if (typeof rendered !== 'string') {
    rendered.classList.add('wf-markdown')
    return rendered
  }
  const el = document.createElement('div')
  el.classList.add('wf-markdown')
  el.innerHTML = rendered
  return el
}

const createImageEl = (src: string, alt: string): HTMLImageElement => {
  const img = document.createElement('img')
  img.classList.add('wf-result-image')
  img.src = src
  img.alt = alt
  return img
}

// Render precedence: the general hook overrides; then built-ins (markdown for
// 'markdown'-format strings, <img> for image fields); otherwise the default.
const createResultValue = ({
  value,
  meta,
  renderResultField,
  renderMarkdown,
}: ResultValueProps): HTMLElement => {
  if (meta && renderResultField) {
    const rendered = renderResultField(value, meta)
    if (typeof rendered === 'string')
      return createValueBlock({ value: rendered })
    if (rendered) return createValueWrapper(rendered)
  }

  if (
    meta?.format === FIELD_FORMAT.MARKDOWN &&
    renderMarkdown &&
    typeof value === 'string'
  ) {
    return createValueWrapper(createMarkdownEl(renderMarkdown(value)))
  }

  if (meta?.dataType === 'image' && typeof value === 'string' && value) {
    return createValueWrapper(createImageEl(value, meta.name))
  }

  return createValueBlock({ value })
}

const availableFormats = (
  renderMarkdown?: RenderMarkdown,
): readonly string[] =>
  renderMarkdown
    ? FIELD_FORMATS
    : FIELD_FORMATS.filter((format) => format !== FIELD_FORMAT.MARKDOWN)

const createFormatSwitch = (
  meta: ResultFieldMeta,
  formats: readonly string[],
  onFormatChange: FormatChange,
): HTMLElement => {
  const select = createSelectInput({
    value: typeof meta.format === 'string' ? meta.format : FIELD_FORMAT.TEXT,
    options: [...formats],
    onChange: (next) => onFormatChange(meta.name, next),
  })
  select.classList.add('wf-result-format')
  return select
}

interface FieldRowProps {
  label: string
  value: unknown
  copyable?: boolean
  meta?: ResultFieldMeta
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  onFormatChange?: FormatChange
}

const createFieldRow = ({
  label,
  value,
  copyable,
  meta,
  renderResultField,
  renderMarkdown,
  onFormatChange,
}: FieldRowProps): HTMLDivElement => {
  const row = document.createElement('div')
  row.classList.add('wf-result-row')

  const labelEl = document.createElement('div')
  labelEl.classList.add('wf-result-row-label')
  labelEl.textContent = label

  // Copyable rows pair the label with a copy button that yields the raw value.
  if (copyable) {
    const header = document.createElement('div')
    header.classList.add('wf-result-row-header')
    header.appendChild(labelEl)
    // Format (text/markdown) only applies to an actual string value. A field
    // declared `string` can still arrive as a list (e.g. "run once per item"),
    // which renders as a tree — showing the switch there would mislead.
    const formats = availableFormats(renderMarkdown)
    if (
      meta?.dataType === 'string' &&
      typeof value === 'string' &&
      onFormatChange &&
      formats.length > 1
    ) {
      header.appendChild(createFormatSwitch(meta, formats, onFormatChange))
    }
    header.appendChild(
      createCopyButton({ getText: () => stringifyForCopy(value) }),
    )
    row.appendChild(header)
  } else {
    row.appendChild(labelEl)
  }

  row.appendChild(
    createResultValue({ value, meta, renderResultField, renderMarkdown }),
  )
  return row
}

interface FieldListProps {
  entries: Record<string, unknown>
  copyable?: boolean
  resultFields?: ResultFieldMeta[]
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  onFormatChange?: FormatChange
}

const createFieldList = ({
  entries,
  copyable,
  resultFields,
  renderResultField,
  renderMarkdown,
  onFormatChange,
}: FieldListProps): HTMLDivElement => {
  const list = document.createElement('div')
  list.classList.add('wf-result-fields')
  for (const [label, value] of Object.entries(entries)) {
    const meta = resultFields?.find((f) => f.name === label)
    list.appendChild(
      createFieldRow({
        label,
        value,
        copyable,
        meta,
        renderResultField,
        renderMarkdown,
        onFormatChange,
      }),
    )
  }
  return list
}

interface OutputBodyProps {
  value: unknown
  resultFields?: ResultFieldMeta[]
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  onFormatChange?: FormatChange
}

// A result is an object keyed by the Output node's fields — one copyable row per
// field so values read and copy raw. Non-objects fall back to a single block.
const createOutputBody = ({
  value,
  resultFields,
  renderResultField,
  renderMarkdown,
  onFormatChange,
}: OutputBodyProps): HTMLElement => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isTruncatedValue(value) &&
    Object.keys(value).length > 0
  ) {
    return createFieldList({
      entries: value as Record<string, unknown>,
      copyable: true,
      resultFields,
      renderResultField,
      renderMarkdown,
      onFormatChange,
    })
  }
  const meta = resultFields?.length === 1 ? resultFields[0] : undefined
  const valueEl = createResultValue({
    value,
    meta,
    renderResultField,
    renderMarkdown,
  })
  // A lone string output (e.g. an LLM's streamed text) still gets the format
  // switch — paired above the value, with no per-field label to align it to.
  const formats = availableFormats(renderMarkdown)
  if (meta?.dataType === 'string' && onFormatChange && formats.length > 1) {
    return createSingleValue({ valueEl, meta, formats, onFormatChange })
  }
  return valueEl
}

interface SingleValueProps {
  valueEl: HTMLElement
  meta: ResultFieldMeta
  formats: readonly string[]
  onFormatChange: FormatChange
}

const createSingleValue = ({
  valueEl,
  meta,
  formats,
  onFormatChange,
}: SingleValueProps): HTMLDivElement => {
  const wrap = document.createElement('div')
  wrap.classList.add('wf-result-single')
  const header = document.createElement('div')
  header.classList.add('wf-result-single-header')
  header.appendChild(createFormatSwitch(meta, formats, onFormatChange))
  wrap.appendChild(header)
  wrap.appendChild(valueEl)
  return wrap
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Last-Run Content (per node type)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ResultContext {
  resultFields: ResultFieldMeta[]
  inputFields: ResultFieldMeta[]
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  onFormatChange?: FormatChange
}

// Each section builds its DOM once, then patches its own leaves on update — so a
// streamed entry never tears the subtree down (scroll/expand/selection survive).
type SectionHandle = UpdatableView<RunDataEntry>

type SectionBuilder = (ctx: ResultContext) => SectionHandle[]

const createDecisionBadge = (decision: ReviewDecision): HTMLElement => {
  const approved = decision === REVIEW_DECISION.APPROVED
  return createBadge({
    tone: approved ? TONE.SUCCESS : TONE.WARNING,
    label: approved ? 'Approved' : 'Rejected',
    dot: true,
  })
}

const createStatusSection = (): SectionHandle => {
  const slot = document.createElement('div')
  slot.classList.add('wf-result-status')
  let status: NodeStatus | undefined
  let durationMs: number | undefined
  let decision: ReviewDecision | undefined
  return {
    element: slot,
    update: (entry) => {
      if (
        entry.status === status &&
        entry.durationMs === durationMs &&
        entry.decision === decision
      ) {
        return
      }
      status = entry.status
      durationMs = entry.durationMs
      decision = entry.decision
      const pills = [createStatusPill({ status, durationMs })]
      if (decision) pills.push(createDecisionBadge(decision))
      slot.replaceChildren(...pills)
    },
  }
}

const createInputsSection = (ctx: ResultContext): SectionHandle => {
  const shell = createSectionShell('Inputs')
  let rendered: Record<string, unknown> | undefined
  return {
    element: shell.element,
    update: (entry) => {
      const inputs = entry.inputs
      if (!inputs || Object.keys(inputs).length === 0) {
        shell.setVisible(false)
        return
      }
      shell.setVisible(true)
      shell.setCopyData(inputs)
      // Inputs are fixed once a run starts; rebuild the list only if they change.
      if (inputs === rendered) return
      rendered = inputs
      shell.setBody(
        createFieldList({
          entries: inputs,
          resultFields: ctx.inputFields,
          renderResultField: ctx.renderResultField,
          renderMarkdown: ctx.renderMarkdown,
        }),
      )
    },
  }
}

const createToolCallsSection = (): SectionHandle => {
  const shell = createSectionShell('Tool Calls')
  const list = document.createElement('div')
  list.classList.add('wf-toolcall-list')
  shell.setBody(list)
  // Reconcile by callId so a call completing never collapses a card the user expanded.
  const cards = createListReconciler(list, (c) => c.callId, createToolCallCard)
  return {
    element: shell.element,
    update: (entry) => {
      const calls = entry.toolCalls ?? []
      if (calls.length === 0) {
        shell.setVisible(false)
        return
      }
      shell.setVisible(true)
      shell.setCopyData(calls)
      cards.update(calls)
    },
  }
}

// Streamed text is the live (and final) output of streaming nodes; prefer it over
// outputData so the full, untruncated text shows.
const liveOutput = (entry: RunDataEntry): unknown =>
  typeof entry.streamedText === 'string' && entry.streamedText.length > 0
    ? entry.streamedText
    : entry.outputData

const createOutputSection = (
  ctx: ResultContext,
  title: string,
  getValue: (entry: RunDataEntry) => unknown,
): SectionHandle => {
  const shell = createSectionShell(title)
  let kind: string | undefined
  let textEl: HTMLElement | undefined
  return {
    element: shell.element,
    update: (entry) => {
      const value = getValue(entry)
      if (value === undefined || value === null) {
        shell.setVisible(false)
        return
      }
      shell.setVisible(true)
      shell.setCopyData(value)
      // A growing plain-text stream patches its text node in place; anything else
      // (markdown, an object result) rebuilds the body, which happens rarely.
      const next = outputKind(value, ctx.resultFields)
      if (next === 'text' && kind === 'text' && textEl) {
        textEl.textContent = value as string
        return
      }
      const body = createOutputBody({
        value,
        resultFields: ctx.resultFields,
        renderResultField: ctx.renderResultField,
        renderMarkdown: ctx.renderMarkdown,
        onFormatChange: ctx.onFormatChange,
      })
      shell.setBody(body)
      kind = next
      textEl =
        next === 'text'
          ? ((body.querySelector(
              '.wf-result-value-text',
            ) as HTMLElement | null) ?? undefined)
          : undefined
    },
  }
}

// Distinguishes a patchable plain-text value from bodies that must be rebuilt.
const outputKind = (
  value: unknown,
  resultFields: ResultFieldMeta[],
): string => {
  if (typeof value !== 'string') return 'block'
  const meta = resultFields.length === 1 ? resultFields[0] : undefined
  return meta?.format === FIELD_FORMAT.MARKDOWN ? 'markdown' : 'text'
}

const createErrorSection = (): SectionHandle => {
  const shell = createSectionShell('Error')
  let rendered = false
  return {
    element: shell.element,
    update: (entry) => {
      const error = entry.error
      if (!error) {
        shell.setVisible(false)
        return
      }
      shell.setVisible(true)
      if (rendered) return
      rendered = true
      shell.setCopyData(
        [error.code, error.message, error.hint, error.docsUrl]
          .filter(Boolean)
          .join('\n'),
      )
      shell.setBody(
        createAlert({
          tone: TONE.ERROR,
          text: error.message,
          code: error.code,
          hint: error.hint,
          docsUrl: error.docsUrl,
        }),
      )
    },
  }
}

const defaultSections: SectionBuilder = (ctx) => [
  createInputsSection(ctx),
  createToolCallsSection(),
  createOutputSection(ctx, 'Output', liveOutput),
]

// The Output node collects its inputs as the run's result, so its inputs and
// output are the same data — show a single "Result" section, not both.
const outputSections: SectionBuilder = (ctx) => [
  createOutputSection(ctx, 'Result', (entry) => entry.outputData),
]

// Unlisted node types fall back to defaultSections.
const RESULT_SECTIONS: Record<string, SectionBuilder> = {
  output: outputSections,
}

const buildSections = (
  nodeType: string | undefined,
  ctx: ResultContext,
): SectionHandle[] => {
  const typeSections =
    (nodeType && RESULT_SECTIONS[nodeType]) || defaultSections
  return [createStatusSection(), ...typeSections(ctx), createErrorSection()]
}

// Where each node type's declared output fields live in its config — used to
// read each field's dataType/format and to persist format-switch changes.
const RESULT_FIELDS_KEY: Record<string, string> = {
  input: 'fields',
  output: 'fields',
  llm: 'outputSchema',
}

// Same, for the fields a node receives — so image inputs render as images.
const INPUT_FIELDS_KEY: Record<string, string> = {
  input: 'fields',
  llm: 'variableDefaults',
}

// Output fields for node types whose schema is fixed by the port shape rather
// than stored in config.
const STATIC_RESULT_FIELDS: Record<string, ResultFieldMeta[]> = {
  imageGeneration: [{ name: 'image', dataType: 'image' }],
}

const resolveFields = (
  keyMap: Record<string, string>,
  nodeType: string | undefined,
  nodeConfig: Record<string, unknown> | undefined,
): ResultFieldMeta[] => {
  const key = nodeType ? keyMap[nodeType] : undefined
  const fields = key ? nodeConfig?.[key] : undefined
  return Array.isArray(fields) ? (fields as ResultFieldMeta[]) : []
}

const resolveResultFields = (
  nodeType: string | undefined,
  nodeConfig: Record<string, unknown> | undefined,
): ResultFieldMeta[] => {
  const fromConfig = resolveFields(RESULT_FIELDS_KEY, nodeType, nodeConfig)
  if (fromConfig.length > 0) return fromConfig
  return (nodeType ? STATIC_RESULT_FIELDS[nodeType] : undefined) ?? []
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Tool Calls
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const TOOL_CALL_PILL_STATUS: Record<
  ToolCallStatus,
  'info' | 'success' | 'error'
> = {
  [TOOL_CALL_STATUS.RUNNING]: 'info',
  [TOOL_CALL_STATUS.COMPLETE]: 'success',
  [TOOL_CALL_STATUS.ERROR]: 'error',
}

const TOOL_CALL_PILL_LABEL: Record<ToolCallStatus, string> = {
  [TOOL_CALL_STATUS.RUNNING]: 'Running…',
  [TOOL_CALL_STATUS.COMPLETE]: 'Complete',
  [TOOL_CALL_STATUS.ERROR]: 'Error',
}

type ToolCallCardHandle = UpdatableView<ToolCallEntry>

const createToolCallCard = (call: ToolCallEntry): ToolCallCardHandle => {
  const head = createToolCallHead(call)
  const body = createToolCallBody(call)
  const { element } = createDisclosure({
    header: head.element,
    content: body.element,
  })
  element.classList.add('wf-toolcall')

  let status: ToolCallStatus | undefined
  return {
    element,
    // Only the status-driven parts change; patch them so the card (and any
    // expanded state) stays put as the call moves running → complete/error.
    update: (next) => {
      if (next.status === status) return
      status = next.status
      head.setMeta(next)
      body.setOutcome(next)
    },
  }
}

interface ToolCallHeadHandle {
  element: HTMLDivElement
  setMeta: (call: ToolCallEntry) => void
}

const createToolCallHead = (call: ToolCallEntry): ToolCallHeadHandle => {
  const head = document.createElement('div')
  head.classList.add('wf-toolcall-head')

  const iconWrap = document.createElement('span')
  iconWrap.classList.add('wf-toolcall-icon')
  iconWrap.appendChild(createIcon({ name: 'tool', size: 11 }))
  head.appendChild(iconWrap)

  const name = document.createElement('span')
  name.classList.add('wf-toolcall-name')
  name.textContent = call.tool
  head.appendChild(name)

  let meta = createToolCallMeta(call)
  head.appendChild(meta)

  return {
    element: head,
    setMeta: (next) => {
      const el = createToolCallMeta(next)
      meta.replaceWith(el)
      meta = el
    },
  }
}

const createToolCallMeta = (call: ToolCallEntry): HTMLSpanElement => {
  const meta = document.createElement('span')
  meta.classList.add('wf-toolcall-meta')
  meta.appendChild(createToolCallPill(call))
  if (
    call.status === TOOL_CALL_STATUS.COMPLETE &&
    typeof call.durationMs === 'number'
  ) {
    const duration = document.createElement('span')
    duration.textContent = `· ${formatDuration(call.durationMs)}`
    meta.appendChild(duration)
  }
  return meta
}

const createToolCallPill = (call: ToolCallEntry): HTMLSpanElement => {
  const pill = document.createElement('span')
  pill.classList.add('wf-toolcall-pill')
  pill.dataset.status = TOOL_CALL_PILL_STATUS[call.status]
  const dot = document.createElement('span')
  dot.classList.add('wf-toolcall-dot')
  pill.appendChild(dot)
  pill.appendChild(document.createTextNode(TOOL_CALL_PILL_LABEL[call.status]))
  return pill
}

interface ToolCallBodyHandle {
  element: HTMLDivElement
  setOutcome: (call: ToolCallEntry) => void
}

const createToolCallBody = (call: ToolCallEntry): ToolCallBodyHandle => {
  const body = document.createElement('div')
  body.classList.add('wf-toolcall-body')

  body.appendChild(
    createToolCallSection({
      label: 'Args',
      content: createToolCallCode({ value: call.args }),
    }),
  )

  // The result/error arrives when the call finishes; swap it in then.
  let outcome: HTMLElement | undefined
  const setOutcome = (next: ToolCallEntry) => {
    if (outcome) {
      outcome.remove()
      outcome = undefined
    }
    if (next.error) {
      outcome = createToolCallSection({
        label: 'Error',
        content: createToolCallError({ message: next.error.message }),
      })
    } else if (
      next.status === TOOL_CALL_STATUS.COMPLETE &&
      next.result !== undefined
    ) {
      outcome = createToolCallSection({
        label: 'Result',
        content: createToolCallResult({ value: next.result }),
      })
    }
    if (outcome) body.appendChild(outcome)
  }

  return { element: body, setOutcome }
}

interface ToolCallSectionProps {
  label: string
  content: HTMLElement
}

const createToolCallSection = ({
  label,
  content,
}: ToolCallSectionProps): HTMLDivElement => {
  const section = document.createElement('div')
  section.classList.add('wf-toolcall-section')
  const labelEl = document.createElement('span')
  labelEl.classList.add('wf-toolcall-label')
  labelEl.textContent = label
  section.appendChild(labelEl)
  section.appendChild(content)
  return section
}

interface ToolCallCodeProps {
  value: unknown
}

const createToolCallCode = ({ value }: ToolCallCodeProps): HTMLDivElement => {
  const el = document.createElement('div')
  el.classList.add('wf-toolcall-code')
  el.textContent = stringifyForCopy(value)
  return el
}

interface ToolCallResultProps {
  value: unknown
}

// Strings render as plain text; structured values fall back to formatted JSON.
const createToolCallResult = ({ value }: ToolCallResultProps): HTMLElement => {
  if (typeof value === 'string') {
    const el = document.createElement('div')
    el.classList.add('wf-toolcall-result')
    el.textContent = value
    return el
  }
  return createToolCallCode({ value })
}

interface ToolCallErrorProps {
  message: string
}

const createToolCallError = ({
  message,
}: ToolCallErrorProps): HTMLDivElement => {
  const el = document.createElement('div')
  el.classList.add('wf-toolcall-error')
  el.textContent = message
  return el
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createResultPanel = ({
  container,
  renderResultField,
  renderMarkdown,
  onConfigChange,
}: CreateResultPanelParams): ResultPanelHandle => {
  const panel = createPanelRoot()
  container.appendChild(panel)

  let lastShow: ResultShowParams | undefined
  let renderedKey: string | undefined
  let sections: SectionHandle[] = []

  // Switching a field's format is a display change: persist it to the node and
  // re-render the preview in place, so it updates without a re-run.
  const handleFormatChange: FormatChange = (fieldName, format) => {
    if (!lastShow || !onConfigChange) return
    const { nodeId, nodeType, nodeConfig } = lastShow
    const key = nodeType ? RESULT_FIELDS_KEY[nodeType] : undefined
    if (!nodeId || !key) return
    const fields = nodeConfig?.[key]
    if (!Array.isArray(fields)) return
    const nextFields = (fields as Field[]).map((f) =>
      f.name === fieldName ? { ...f, format } : f,
    )
    onConfigChange({ nodeId, key, newValue: nextFields })
    show({ ...lastShow, nodeConfig: { ...nodeConfig, [key]: nextFields } })
  }

  const show = (params: ResultShowParams) => {
    lastShow = params
    const { entry, nodeType, nodeConfig } = params
    const ctx: ResultContext = {
      resultFields: resolveResultFields(nodeType, nodeConfig),
      inputFields: resolveFields(INPUT_FIELDS_KEY, nodeType, nodeConfig),
      renderResultField,
      renderMarkdown,
      onFormatChange: onConfigChange ? handleFormatChange : undefined,
    }

    // Rebuild the sections only when the target node, type, or field shapes
    // change; otherwise reuse them and let each patch its leaves from the entry.
    const key = JSON.stringify([
      params.nodeId,
      nodeType,
      ctx.resultFields,
      ctx.inputFields,
    ])
    if (key !== renderedKey) {
      renderedKey = key
      sections = buildSections(nodeType, ctx)
      panel.replaceChildren(...sections.map((s) => s.element))
    }
    for (const section of sections) section.update(entry)
  }

  const destroy = () => {
    panel.remove()
  }

  return {
    element: panel,
    show,
    destroy,
  }
}
