import {
  ARRAY_OP,
  type ArrayOpConfig,
  COMPARE_OPERATOR,
  type CompareOperator,
  createConsoleLogger,
  createError,
  ERROR_CODE,
  type Field,
  isFieldRequired,
  isFieldValueEmpty,
  type Logger,
  SORT_DIRECTION,
  type SortDirection,
  type ToolMetadata,
  type TruncatedValue,
  WayflowError,
  type WayflowErrorPayload,
} from '@wayflow/agent'
import {
  detectCycle,
  EDGE_STATUS,
  type Edge,
  type Graph,
  isAsyncIterable,
  isPlainObject,
  NODE_STATUS,
  type Node,
} from '@wayflow/core'
import { createAsyncQueue } from './async-queue'
import type { Handler, HandlerContext } from './handler'
import { attachLogger } from './logger'
import {
  type Checkpoint,
  RUN_STATUS,
  type RuntimeEvent,
  type Suspension,
} from './protocol'
import type { Tool } from './tools'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Truncation limits
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const TRUNCATION_LIMIT = 32 * 1024
const TRUNCATION_PREVIEW = 200

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Sub-graph recursion
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A handler can run a sub-graph via ctx.runGraph (e.g. a workflow exposed as a
// tool). This caps how deep that nesting can go so a workflow that calls itself
// as a tool fails fast instead of running away.
const MAX_GRAPH_RECURSION_DEPTH = 8

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Suspend signal (handler-driven pause)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A handler returns suspend() to halt the run for outside input — human review,
// a timer, an external webhook. The scheduler snapshots state into a Checkpoint
// and emits a Suspension; resume() continues from there. Pausing is a handler
// capability, not a built-in node type: any handler (including a user's own) can
// pause by returning this. The brand is a module-private symbol so a value that
// merely round-tripped through JSON can never be mistaken for one.
const SUSPEND = Symbol('wayflow.suspend')

interface SuspendSignal {
  [SUSPEND]: true
  instructions: string
  data: unknown
}

export interface SuspendParams {
  instructions?: string
  data?: unknown
}

export const suspend = (params: SuspendParams = {}): SuspendSignal => ({
  [SUSPEND]: true,
  instructions: params.instructions ?? '',
  data: params.data,
})

const isSuspendSignal = (value: unknown): value is SuspendSignal =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<symbol, unknown>)[SUSPEND] === true

// The output ports a human review routes its decision to. Reject still emits the
// reviewed data — down `rejected` — so a rejection path can act on it.
export const REVIEW_BRANCH = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ReviewBranch = (typeof REVIEW_BRANCH)[keyof typeof REVIEW_BRANCH]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface CreateRuntimeOptions {
  handlers?: Record<string, Handler>
  tools?: Record<string, Tool>
  // A diagnostics sink for the run trace (started/completed/failed per node and
  // tool call). Provide your own to route logs anywhere, or set `debug: true`
  // for a built-in console logger. A logger here wins over `debug`.
  logger?: Logger
  debug?: boolean
}

export interface RunOptions {
  signal?: AbortSignal
  inputs?: Record<string, unknown>
  resume?: { checkpoint: Checkpoint; decision: Decision }
}

// A run ends in one of two ways the caller must branch on: it finished, or it
// paused at a suspend point. Errors and cancellation stay throws.
export type RunOutcome<
  R extends Record<string, unknown> = Record<string, unknown>,
> =
  | { status: typeof RUN_STATUS.COMPLETED; result: R }
  | { status: typeof RUN_STATUS.PAUSED; suspension: Suspension }

export interface Decision {
  // The output port to route the decided data to (e.g. approved / rejected).
  branch: ReviewBranch
  // The (optionally edited) value to emit; falls back to the reviewed data.
  data?: unknown
}

export interface ResumeOptions {
  checkpoint: Checkpoint
  decision: Decision
  signal?: AbortSignal
}

export interface Runtime {
  // One-shot — returns the run outcome (completed or paused). Throws on run
  // errors (WayflowError) and cancellation (AbortError).
  run<R extends Record<string, unknown> = Record<string, unknown>>(
    graph: Graph,
    options?: RunOptions,
  ): Promise<RunOutcome<R>>
  // Continues a paused run from its checkpoint with the human's decision. May
  // pause again at a later suspend point. Throws if the checkpoint is stale.
  resume<R extends Record<string, unknown> = Record<string, unknown>>(
    graph: Graph,
    options: ResumeOptions,
  ): Promise<RunOutcome<R>>
  // Streaming — yields events as the graph executes.
  stream(graph: Graph, options?: RunOptions): AsyncIterable<RuntimeEvent>
  // Editor-facing catalog: registered tools with handlers stripped.
  describe(): { tools: Record<string, ToolMetadata> }
}

export const createRuntime = ({
  handlers: userHandlers = {},
  tools = {},
  logger,
  debug = false,
}: CreateRuntimeOptions = {}): Runtime => {
  const handlers: Record<string, Handler> = {
    ...STRUCTURAL_HANDLERS,
    ...userHandlers,
  }

  const log = logger ?? (debug ? createConsoleLogger() : undefined)

  const stream = (graph: Graph, options?: RunOptions) => {
    const events = runGraph(
      graph,
      handlers,
      tools,
      options,
      options?.resume
        ? { ...options.resume, signal: options.signal }
        : undefined,
    )
    return log ? attachLogger(events, graph, log) : events
  }

  const run = <R extends Record<string, unknown>>(
    graph: Graph,
    options?: RunOptions,
  ): Promise<RunOutcome<R>> => drainToOutcome<R>(stream(graph, options))

  const resume = <R extends Record<string, unknown>>(
    graph: Graph,
    options: ResumeOptions,
  ): Promise<RunOutcome<R>> =>
    drainToOutcome<R>(
      stream(graph, {
        resume: { checkpoint: options.checkpoint, decision: options.decision },
        signal: options.signal,
      }),
    )

  const describe = (): { tools: Record<string, ToolMetadata> } => {
    const stripped: Record<string, ToolMetadata> = {}
    for (const [name, tool] of Object.entries(tools)) {
      stripped[name] = {
        description: tool.description,
        parameters: tool.parameters,
      }
    }
    return { tools: stripped }
  }

  return { run, resume, stream, describe }
}

// Drains an event stream to a RunOutcome: completed/paused become values the
// caller branches on; error/cancelled stay throws.
export const drainToOutcome = async <R extends Record<string, unknown>>(
  events: AsyncIterable<RuntimeEvent>,
): Promise<RunOutcome<R>> => {
  let result: Record<string, unknown> = {}
  for await (const evt of events) {
    if (evt.event !== 'run_status') continue
    const { data } = evt
    if (data.status === RUN_STATUS.ERROR) throw new WayflowError(data.error)
    if (data.status === RUN_STATUS.CANCELLED) {
      throw new DOMException('The run was cancelled.', 'AbortError')
    }
    if (data.status === RUN_STATUS.PAUSED) {
      return { status: RUN_STATUS.PAUSED, suspension: data.suspension }
    }
    if (data.status === RUN_STATUS.COMPLETED) result = data.result
  }
  return { status: RUN_STATUS.COMPLETED, result: result as R }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Built-in structural handlers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const STRUCTURAL_HANDLERS: Record<string, Handler> = {
  // Emits each Input field's value. Caller-supplied `inputs` from RunOptions
  // override the field's `default`. Honors the single-port routing rule:
  // scalar return for one field, object keyed by field name for many.
  input: async (node, _, ctx) => {
    const fields = (node.data.fields as Field[] | undefined) ?? []
    if (fields.length === 0) return undefined
    const fieldValue = (f: Field): unknown => {
      const provided = ctx.inputs[f.name]
      if (
        isFieldRequired(f) &&
        isFieldValueEmpty(provided) &&
        isFieldValueEmpty(f.default)
      ) {
        throw createError(ERROR_CODE.RUNTIME_MISSING_INPUT, { field: f.name })
      }
      return provided ?? f.default ?? (f.multiple ? [] : '')
    }
    if (fields.length === 1) return fieldValue(fields[0])
    const out: Record<string, unknown> = {}
    for (const f of fields) out[f.name] = fieldValue(f)
    return out
  },

  // Collects whatever flowed into this node's input ports as fields of the
  // run's final result. `inputs` is already keyed by target port id (= field name).
  // Returning `inputs` populates the node's post-run preview/inspector with the
  // collected result; no output ports means the value isn't routed anywhere.
  output: async (_node, inputs, ctx) => {
    ctx.collectAsResult(inputs)
    return inputs
  },

  // Combines N upstream branches into one output. Mode picks the strategy:
  //  - pass-through: emit whichever input arrived (default; ideal for conditional rejoin)
  //  - combine: emit { fieldName: value, ... } preserving input port keys
  //  - concatenate: newline-join values as strings
  //  - zip: pair list inputs by index into one list of { fieldName: value, ... },
  //    truncated to the shortest list; scalar inputs broadcast into every row
  // Undefined inputs (skipped branches) are filtered in all modes.
  merge: async (node, inputs) => {
    const mode = (node.data.mode as string | undefined) ?? 'pass-through'
    const defined = Object.entries(inputs).filter(([, v]) => v !== undefined)

    if (mode === 'combine') {
      return Object.fromEntries(defined)
    }
    if (mode === 'concatenate') {
      return defined.map(([, v]) => String(v)).join('\n')
    }
    if (mode === 'zip') {
      const lists = defined.filter(([, v]) => Array.isArray(v))
      const length = lists.length
        ? Math.min(...lists.map(([, v]) => (v as unknown[]).length))
        : 0
      return Array.from({ length }, (_, i) =>
        Object.fromEntries(
          defined.map(([k, v]) => [k, Array.isArray(v) ? v[i] : v]),
        ),
      )
    }
    return defined[0]?.[1]
  },

  // Transforms one list with the selected operation.
  arrayOps: async (node, inputs) => {
    const config = (node.data.operation as ArrayOpConfig | undefined) ?? {
      op: ARRAY_OP.COUNT,
    }
    const list = Array.isArray(inputs.list)
      ? inputs.list
      : inputs.list === undefined
        ? []
        : [inputs.list]
    return applyArrayOp(list, config)
  },

  // Routes `value` to the true or false output port based on the operator-driven
  // comparison against `target`. Defaults seed unconnected ports so users can
  // compare against a literal without a Constant node. The chosen branch emits
  // `value` (the data being tested) so downstream nodes get the original payload.
  conditional: async (node, inputs) => {
    const op = (node.data.operator as CompareOperator | undefined) ?? '=='
    const valueDefault = (node.data.valueDefault as string | undefined) ?? ''
    const targetDefault = (node.data.targetDefault as string | undefined) ?? ''
    const value = inputs.value ?? coerce(valueDefault, op)
    const target = inputs.target ?? coerce(targetDefault, op)
    return compare(value, target, op) ? { true: value } : { false: value }
  },

  // Halts the run for human review. The reviewed data is whatever flowed in;
  // resume() routes the (optionally edited) decision to the approved/rejected
  // port. Pausing lives in the returned signal, so the scheduler stays generic.
  humanInTheLoop: async (node, inputs) =>
    suspend({
      instructions: String(node.data.instructions ?? ''),
      data: inputs.input,
    }),
}

const coerce = (value: string, op: CompareOperator): unknown => {
  if (op === '>' || op === '<' || op === '>=' || op === '<=') {
    return Number(value)
  }
  if (op === 'matches') {
    return compileRegex(value)
  }
  return value
}

const compileRegex = (pattern: string): RegExp => {
  // Accept regex-literal syntax `/pattern/flags`. Greedy (.*) captures through
  // the last slash so users can use escaped slashes inside the pattern.
  const literal = pattern.match(/^\/(.*)\/([a-z]*)$/)
  const source = literal ? literal[1] : pattern
  const flags = literal ? literal[2] : ''
  try {
    return new RegExp(source, flags)
  } catch (err) {
    throw createError(
      ERROR_CODE.RUNTIME_INVALID_REGEX,
      { pattern },
      err instanceof Error ? err : new Error(String(err)),
    )
  }
}

const compare = (
  left: unknown,
  right: unknown,
  op: CompareOperator,
): boolean => {
  if (op === '==') return String(left) === String(right)
  if (op === '!=') return String(left) !== String(right)
  if (op === '>') return Number(left) > Number(right)
  if (op === '<') return Number(left) < Number(right)
  if (op === '>=') return Number(left) >= Number(right)
  if (op === '<=') return Number(left) <= Number(right)
  if (op === 'contains') {
    return String(left).toLowerCase().includes(String(right).toLowerCase())
  }
  if (op === 'startsWith') {
    return String(left).toLowerCase().startsWith(String(right).toLowerCase())
  }
  if (op === 'endsWith') {
    return String(left).toLowerCase().endsWith(String(right).toLowerCase())
  }
  if (op === 'matches') {
    const re = right instanceof RegExp ? right : compileRegex(String(right))
    return re.test(String(left))
  }
  return false
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Array operations
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Applies one Array Operations transform. A `field` param reads that key from
// object items (e.g. sort/filter/sum by field); leaf items use the item itself.
const applyArrayOp = (list: unknown[], config: ArrayOpConfig): unknown => {
  const field = config.field?.trim()
  const get = (item: unknown): unknown =>
    field && isPlainObject(item) ? item[field] : item

  switch (config.op) {
    case ARRAY_OP.COUNT:
      return list.length
    case ARRAY_OP.SUM:
      return list.reduce((sum: number, item) => sum + Number(get(item) ?? 0), 0)
    case ARRAY_OP.JOIN:
      return list
        .map((item) => itemToString(get(item)))
        .join(config.separator ?? ', ')
    case ARRAY_OP.FIRST:
      return list[0]
    case ARRAY_OP.LAST:
      return list[list.length - 1]
    case ARRAY_OP.TAKE:
      return list.slice(0, Math.max(0, config.count ?? 0))
    case ARRAY_OP.SLICE:
      return list.slice(config.start ?? 0, config.end)
    case ARRAY_OP.FILTER:
      return list.filter((item) =>
        compare(
          get(item),
          config.value ?? '',
          config.operator ?? COMPARE_OPERATOR.EQ,
        ),
      )
    case ARRAY_OP.SORT:
      return sortList(list, get, config.direction ?? SORT_DIRECTION.ASC)
    case ARRAY_OP.UNIQUE:
      return uniqueBy(list, get)
    case ARRAY_OP.PLUCK:
      return list.map(get)
    default:
      return list
  }
}

const itemToString = (value: unknown): string =>
  value == null
    ? ''
    : typeof value === 'object'
      ? (safeStringify(value) ?? '')
      : String(value)

const sortList = (
  list: unknown[],
  get: (item: unknown) => unknown,
  direction: SortDirection,
): unknown[] => {
  const dir = direction === SORT_DIRECTION.DESC ? -1 : 1
  return [...list].sort((a, b) => {
    const av = get(a)
    const bv = get(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}

const uniqueBy = (
  list: unknown[],
  get: (item: unknown) => unknown,
): unknown[] => {
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const item of list) {
    const key = itemToString(get(item))
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Scheduler
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

async function* runGraph(
  graph: Graph,
  handlers: Record<string, Handler>,
  tools: Record<string, Tool>,
  options?: RunOptions,
  resume?: ResumeOptions,
  depth = 0,
): AsyncIterable<RuntimeEvent> {
  // A checkpoint can only resume against the graph it paused on. Recompute the
  // structural fingerprint and reject up front (a throw, not a run error) so a
  // host never silently runs a decision against a rewired graph.
  if (resume && fingerprintGraph(graph) !== resume.checkpoint.fingerprint) {
    throw createError(ERROR_CODE.RUNTIME_CHECKPOINT_STALE)
  }

  // One id for the whole run, reused if it pauses and resumes, so a paused →
  // resumed run correlates as one in logs and the checkpoint.
  const runId = resume?.checkpoint.runId ?? newRunId()

  yield { event: 'run_status', data: { status: RUN_STATUS.RUNNING, runId } }

  const allNodes = Object.keys(graph.nodes)
  if (allNodes.length === 0) {
    yield {
      event: 'run_status',
      data: {
        status: RUN_STATUS.ERROR,
        error: createError(ERROR_CODE.RUNTIME_EMPTY_GRAPH).toJSON(),
      },
    }
    return
  }

  const cycle = detectCycle(graph)
  if (cycle) {
    yield {
      event: 'run_status',
      data: {
        status: RUN_STATUS.ERROR,
        error: createError(ERROR_CODE.RUNTIME_CYCLE_DETECTED, {
          path: cycle.join(' → '),
        }).toJSON(),
      },
    }
    return
  }

  const missingTool = findUnregisteredTool(graph, tools)
  if (missingTool) {
    const error = createError(ERROR_CODE.RUNTIME_TOOL_NOT_REGISTERED, {
      name: missingTool.tool,
    }).toJSON()
    yield {
      event: 'node_status',
      data: { nodeId: missingTool.nodeId, status: NODE_STATUS.ERROR, error },
    }
    yield {
      event: 'run_status',
      data: { status: RUN_STATUS.ERROR, error },
    }
    return
  }

  const outputs = new Map<string, unknown>()
  const completed = new Set<string>()
  const failed = new Set<string>()
  const result: Record<string, unknown> = {}

  if (resume) {
    yield* restoreCheckpoint(graph, resume, outputs, completed, failed, result)
  }

  const incomingFor = (nodeId: string): Edge[] =>
    Object.values(graph.edges).filter((e) => e.targetNodeId === nodeId)

  const outgoingFor = (nodeId: string): Edge[] =>
    Object.values(graph.edges).filter((e) => e.sourceNodeId === nodeId)

  const isProcessed = (nodeId: string): boolean =>
    completed.has(nodeId) || failed.has(nodeId)

  const upstreamSettled = (nodeId: string): boolean =>
    incomingFor(nodeId).every(
      (e) => completed.has(e.sourceNodeId) || failed.has(e.sourceNodeId),
    )

  function* cascadeSkips(): Generator<RuntimeEvent> {
    let progressed = true
    while (progressed) {
      progressed = false
      for (const nodeId of allNodes) {
        if (isProcessed(nodeId)) continue
        const incoming = incomingFor(nodeId)
        if (incoming.length === 0) continue
        if (!upstreamSettled(nodeId)) continue
        const allInputsMissing = incoming.every(
          (e) => !outputs.has(`${e.sourceNodeId}:${e.sourcePortId}`),
        )
        if (!allInputsMissing) continue

        for (const edge of incoming) {
          yield {
            event: 'edge_status',
            data: { edgeId: edge.id, status: EDGE_STATUS.SKIPPED },
          }
        }
        // Dim outgoing edges immediately too — otherwise they sit in default
        // 'idle' (full opacity) until the downstream node runs and reclassifies
        // them, leaving a visual gap mid-run.
        for (const edge of outgoingFor(nodeId)) {
          yield {
            event: 'edge_status',
            data: { edgeId: edge.id, status: EDGE_STATUS.SKIPPED },
          }
        }
        yield {
          event: 'node_status',
          data: { nodeId, status: NODE_STATUS.SKIPPED },
        }
        completed.add(nodeId)
        progressed = true
      }
    }
  }

  let scheduleError: WayflowErrorPayload | undefined
  let cancelled = false
  const nodeErrors: Array<{ nodeId: string; error: WayflowErrorPayload }> = []

  while (completed.size + failed.size < allNodes.length) {
    if (options?.signal?.aborted) {
      cancelled = true
      break
    }

    yield* cascadeSkips()
    if (completed.size + failed.size >= allNodes.length) break

    const runnable = allNodes.find(
      (nodeId) => !isProcessed(nodeId) && upstreamSettled(nodeId),
    )
    if (!runnable) {
      scheduleError = createError(
        ERROR_CODE.RUNTIME_UNSCHEDULABLE_GRAPH,
      ).toJSON()
      break
    }

    const nodeResult = yield* runNode(
      graph,
      runnable,
      handlers,
      tools,
      outputs,
      result,
      options,
      depth,
    )
    if (nodeResult.kind === 'suspended') {
      const checkpoint: Checkpoint = {
        runId,
        outputs: Object.fromEntries(outputs),
        completed: [...completed],
        failed: [...failed],
        result: { ...result },
        pending: runnable,
        fingerprint: fingerprintGraph(graph),
      }
      yield {
        event: 'run_status',
        data: {
          status: RUN_STATUS.PAUSED,
          suspension: {
            runId: checkpoint.runId,
            nodeId: runnable,
            instructions: nodeResult.signal.instructions,
            data: nodeResult.signal.data,
            checkpoint,
          },
        },
      }
      return
    }
    if (nodeResult.kind === 'ok') {
      completed.add(runnable)
    } else if (nodeResult.kind === 'cancelled') {
      cancelled = true
      break
    } else {
      failed.add(runnable)
      nodeErrors.push({ nodeId: runnable, error: nodeResult.error })
    }
  }

  if (cancelled) {
    yield {
      event: 'run_status',
      data: { status: RUN_STATUS.CANCELLED, result },
    }
    return
  }

  const runError = scheduleError ?? summarizeNodeErrors(nodeErrors)

  yield {
    event: 'run_status',
    data: runError
      ? { status: RUN_STATUS.ERROR, error: runError }
      : { status: RUN_STATUS.COMPLETED, result },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Suspend / resume
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Rehydrates the scheduler's maps from a checkpoint and applies the decision:
// the paused node completes with the (optionally edited) value routed to the
// chosen port. The other port stays unset, so its branch cascades to skipped.
function* restoreCheckpoint(
  graph: Graph,
  resume: ResumeOptions,
  outputs: Map<string, unknown>,
  completed: Set<string>,
  failed: Set<string>,
  result: Record<string, unknown>,
): Generator<RuntimeEvent> {
  const { checkpoint, decision } = resume
  for (const [key, value] of Object.entries(checkpoint.outputs)) {
    outputs.set(key, value)
  }
  for (const id of checkpoint.completed) completed.add(id)
  for (const id of checkpoint.failed) failed.add(id)
  Object.assign(result, checkpoint.result)

  const pending = checkpoint.pending
  const reviewed = gatherInputs(graph, pending, outputs)
  const data =
    decision.data !== undefined ? decision.data : singleValue(reviewed)
  outputs.set(`${pending}:${decision.branch}`, data)
  completed.add(pending)

  yield {
    event: 'node_status',
    data: {
      nodeId: pending,
      status: NODE_STATUS.COMPLETE,
      outputData: isPlainObject(data)
        ? truncateRecord(data)
        : truncateValue(data),
      finishedAt: Date.now(),
    },
  }
}

const gatherInputs = (
  graph: Graph,
  nodeId: string,
  outputs: Map<string, unknown>,
): Record<string, unknown> => {
  const inputs: Record<string, unknown> = {}
  for (const edge of Object.values(graph.edges)) {
    if (edge.targetNodeId !== nodeId) continue
    inputs[edge.targetPortId] = outputs.get(
      `${edge.sourceNodeId}:${edge.sourcePortId}`,
    )
  }
  return inputs
}

const singleValue = (record: Record<string, unknown>): unknown => {
  const values = Object.values(record)
  return values.length === 1 ? values[0] : record
}

// crypto.randomUUID exists only in secure contexts (https/localhost); fall back
// to getRandomValues so runs work over plain HTTP, a LAN IP, or file://.
const newRunId = (): string => {
  const c = globalThis.crypto
  if (c.randomUUID) return c.randomUUID()
  const bytes = c.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// A structural fingerprint of the graph: node ids+types, port ids+sides, and
// edge connections — but not positions, labels, or node config. So a host can
// tweak a not-yet-run node's settings and still resume, while adding, removing,
// or rewiring nodes invalidates the checkpoint. Stored and compared verbatim —
// no hashing, so there's no chance two different structures ever look equal.
const fingerprintGraph = (graph: Graph): string => {
  const nodes = Object.values(graph.nodes)
    .map((n) => ({
      id: n.id,
      type: n.type,
      ports: n.ports.map((p) => `${p.side}:${p.id}`).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const edges = Object.values(graph.edges)
    .map(
      (e) =>
        `${e.sourceNodeId}:${e.sourcePortId}->${e.targetNodeId}:${e.targetPortId}`,
    )
    .sort()
  return JSON.stringify({ nodes, edges })
}

type NodeResult =
  | { kind: 'ok' }
  | { kind: 'error'; error: WayflowErrorPayload }
  | { kind: 'cancelled' }
  | { kind: 'suspended'; signal: SuspendSignal }

async function* runNode(
  graph: Graph,
  nodeId: string,
  handlers: Record<string, Handler>,
  tools: Record<string, Tool>,
  outputs: Map<string, unknown>,
  result: Record<string, unknown>,
  options: RunOptions | undefined,
  depth: number,
): AsyncGenerator<RuntimeEvent, NodeResult, void> {
  const node = graph.nodes[nodeId]
  const incoming = Object.values(graph.edges).filter(
    (e) => e.targetNodeId === nodeId,
  )

  // An incoming edge whose source didn't emit on the source port (skipped, or
  // didn't route to that port) carries no data — keep it dimmed as 'skipped'
  // throughout instead of cycling through active/idle.
  const edgeCarriesData = (edge: Edge): boolean =>
    outputs.has(`${edge.sourceNodeId}:${edge.sourcePortId}`)

  for (const edge of incoming) {
    yield {
      event: 'edge_status',
      data: {
        edgeId: edge.id,
        status: edgeCarriesData(edge)
          ? EDGE_STATUS.ACTIVE
          : EDGE_STATUS.SKIPPED,
      },
    }
  }

  const inputs = gatherInputs(graph, nodeId, outputs)
  const truncatedInputs = truncateRecord(inputs)
  const startedAt = Date.now()

  yield {
    event: 'node_status',
    data: {
      nodeId,
      status: NODE_STATUS.RUNNING,
      inputs: truncatedInputs,
      startedAt,
    },
  }

  const idleEdges = function* (): Generator<RuntimeEvent> {
    for (const edge of incoming) {
      yield {
        event: 'edge_status',
        data: {
          edgeId: edge.id,
          status: edgeCarriesData(edge)
            ? EDGE_STATUS.IDLE
            : EDGE_STATUS.SKIPPED,
        },
      }
    }
  }

  const handler = handlers[node.type]
  if (!handler) {
    const error = createError(ERROR_CODE.RUNTIME_NO_HANDLER, {
      nodeType: node.type,
    }).toJSON()
    yield {
      event: 'node_status',
      data: {
        nodeId,
        status: NODE_STATUS.ERROR,
        error,
        finishedAt: Date.now(),
      },
    }
    yield* idleEdges()
    return { kind: 'error', error }
  }

  const events = createAsyncQueue<RuntimeEvent>()
  const emit = (event: RuntimeEvent): void => events.push(event)

  const signal = options?.signal ?? new AbortController().signal

  // Lets a handler run a sub-graph on this same engine (a workflow exposed as a
  // tool). The sub-run inherits this run's signal so cancellation propagates,
  // and a nested run can't pause — there is no checkpoint/resume path for it.
  const runSubGraph = async (
    subGraph: Graph,
    inputs?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    if (depth + 1 > MAX_GRAPH_RECURSION_DEPTH) {
      throw createError(ERROR_CODE.RUNTIME_RECURSION_LIMIT)
    }
    const outcome = await drainToOutcome(
      runGraph(
        subGraph,
        handlers,
        tools,
        { inputs, signal },
        undefined,
        depth + 1,
      ),
    )
    if (outcome.status === RUN_STATUS.PAUSED) {
      throw createError(ERROR_CODE.RUNTIME_PAUSE_IN_TOOL)
    }
    return outcome.result
  }

  const ctx: HandlerContext = {
    signal,
    emit,
    inputs: options?.inputs ?? {},
    collectAsResult: (fields) => {
      Object.assign(result, fields)
    },
    reportInputs: (effective) => {
      // A map run invokes the handler per item, so reported inputs would be a
      // single element — keep the gathered list inputs instead.
      if (node.data.runPerItem === true) return
      emit({
        event: 'node_status',
        data: {
          nodeId,
          status: NODE_STATUS.RUNNING,
          inputs: truncateRecord(effective),
        },
      })
    },
    tools: wrapNodeTools(resolveNodeTools(node, tools), nodeId, emit),
    runGraph: runSubGraph,
  }

  const consumeHandler = async (
    handlerInputs: Record<string, unknown>,
    stream: boolean,
  ): Promise<unknown> => {
    const ret = handler(node, handlerInputs, ctx)
    if (!isAsyncIterable(ret)) return ret
    let content = ''
    const iterator = ret[Symbol.asyncIterator]()
    let step = await iterator.next()
    while (!step.done) {
      const delta = String(step.value)
      content += delta
      // A single token stream can't carry concurrent per-item runs, so chunks
      // are only forwarded for a one-shot run; tool-call events still interleave.
      if (stream)
        emit({ event: 'node_chunk', data: { nodeId, delta, content } })
      step = await iterator.next()
    }
    // A generator's return value (if any) is the routed output; else the text.
    return step.value !== undefined ? step.value : content
  }

  // "Run once per item": invoke the handler for each element of the node's
  // single list input, broadcasting the other inputs unchanged. Iterations run
  // concurrently and collect back in input order, always as arrays (see
  // collectPerItemOutput). More than one list input is ambiguous — the user
  // combines them upstream with a Merge node.
  const runPerItem = async (): Promise<unknown> => {
    const listKeys = Object.keys(inputs).filter((k) => Array.isArray(inputs[k]))
    if (listKeys.length > 1) {
      throw createError(ERROR_CODE.RUNTIME_MAP_MULTIPLE_LISTS)
    }
    const listKey = listKeys[0]
    const items =
      listKey !== undefined ? (inputs[listKey] as unknown[]) : [undefined]
    const results = await Promise.all(
      items.map((item) =>
        consumeHandler(
          listKey !== undefined ? { ...inputs, [listKey]: item } : inputs,
          false,
        ),
      ),
    )
    if (results.some(isSuspendSignal)) {
      throw createError(ERROR_CODE.RUNTIME_MAP_SUSPEND)
    }
    return collectPerItemOutput(node, results)
  }

  const runHandler = (): Promise<unknown> =>
    node.data.runPerItem === true ? runPerItem() : consumeHandler(inputs, true)

  try {
    const handled = runHandler()
    // Close the stream once the handler settles; its result (or failure) is
    // taken after every emitted event has been drained to the consumer.
    void handled.then(events.close, events.close)
    for await (const event of events) yield event
    const output = await handled

    // The handler asked to pause (human review, a timer, …). Don't route or
    // complete — hand the signal back so the scheduler snapshots and halts.
    if (isSuspendSignal(output)) {
      yield {
        event: 'node_status',
        data: { nodeId, status: NODE_STATUS.WAITING },
      }
      yield* idleEdges()
      return { kind: 'suspended', signal: output }
    }

    routeOutput(node, output, outputs)

    yield {
      event: 'node_status',
      data: {
        nodeId,
        status: NODE_STATUS.COMPLETE,
        // Per-field for objects so the inspector keeps its field-by-field view.
        outputData: isPlainObject(output)
          ? truncateRecord(output)
          : truncateValue(output),
        finishedAt: Date.now(),
      },
    }
    yield* idleEdges()
    return { kind: 'ok' }
  } catch (err) {
    // Distinguish user-initiated cancellation from real errors. AbortError is
    // the standard DOM/fetch signal; signal.aborted catches handlers that
    // bubble plain errors after observing the abort.
    const aborted =
      options?.signal?.aborted ||
      (err instanceof Error && err.name === 'AbortError')
    if (aborted) {
      yield {
        event: 'node_status',
        data: { nodeId, status: NODE_STATUS.CANCELLED, finishedAt: Date.now() },
      }
      yield* idleEdges()
      return { kind: 'cancelled' }
    }
    // Handlers may throw a WayflowError directly (e.g., a coded LLM failure);
    // preserve its fields. Anything else gets wrapped under HANDLER_THREW.
    const error: WayflowErrorPayload =
      err instanceof WayflowError
        ? err.toJSON()
        : createError(
            ERROR_CODE.RUNTIME_HANDLER_THREW,
            undefined,
            err instanceof Error ? err : new Error(String(err)),
          ).toJSON()
    yield {
      event: 'node_status',
      data: {
        nodeId,
        status: NODE_STATUS.ERROR,
        error,
        finishedAt: Date.now(),
      },
    }
    yield* idleEdges()
    return { kind: 'error', error }
  }
}

const nodeToolNames = (node: Node): string[] => {
  const value = node.data.tools
  return Array.isArray(value)
    ? value.filter((n): n is string => typeof n === 'string')
    : []
}

const resolveNodeTools = (
  node: Node,
  registry: Record<string, Tool>,
): Record<string, Tool> => {
  const subset: Record<string, Tool> = {}
  for (const name of nodeToolNames(node)) {
    const tool = registry[name]
    if (tool) subset[name] = tool
  }
  return subset
}

const wrapNodeTools = (
  resolved: Record<string, Tool>,
  nodeId: string,
  emit: (event: RuntimeEvent) => void,
): Record<string, Tool> => {
  const wrapped: Record<string, Tool> = {}
  let counter = 0
  for (const [name, tool] of Object.entries(resolved)) {
    wrapped[name] = {
      description: tool.description,
      parameters: tool.parameters,
      handler: async (args, toolCtx) => {
        const callId = `${nodeId}-tc-${++counter}`
        const startedAt = Date.now()
        emit({
          event: 'tool_call_start',
          data: { nodeId, callId, tool: name, args },
        })
        try {
          const result = await tool.handler(args, toolCtx)
          emit({
            event: 'tool_call_end',
            data: {
              nodeId,
              callId,
              result: truncateValue(result),
              durationMs: Date.now() - startedAt,
            },
          })
          return result
        } catch (err) {
          const error: WayflowErrorPayload =
            err instanceof WayflowError
              ? err.toJSON()
              : createError(
                  ERROR_CODE.RUNTIME_HANDLER_THREW,
                  undefined,
                  err instanceof Error ? err : new Error(String(err)),
                ).toJSON()
          emit({
            event: 'tool_call_end',
            data: { nodeId, callId, error, durationMs: Date.now() - startedAt },
          })
          throw err
        }
      },
    }
  }
  return wrapped
}

const findUnregisteredTool = (
  graph: Graph,
  registry: Record<string, Tool>,
): { tool: string; nodeId: string } | undefined => {
  for (const node of Object.values(graph.nodes)) {
    for (const name of nodeToolNames(node)) {
      if (!(name in registry)) return { tool: name, nodeId: node.id }
    }
  }
  return undefined
}

const routeOutput = (
  node: Node,
  output: unknown,
  outputs: Map<string, unknown>,
): void => {
  const outputPorts = node.ports.filter((p) => p.side === 'output')

  if (outputPorts.length === 0) return

  if (outputPorts.length === 1) {
    outputs.set(`${node.id}:${outputPorts[0].id}`, output)
    return
  }

  if (!isPlainObject(output)) {
    throw createError(ERROR_CODE.RUNTIME_MULTI_PORT_MISMATCH, {
      nodeType: node.type,
      portCount: outputPorts.length,
      portList: outputPorts.map((p) => p.id).join(', '),
    })
  }

  for (const port of outputPorts) {
    if (port.id in output) {
      outputs.set(`${node.id}:${port.id}`, output[port.id])
    }
  }
}

// Reshapes per-item results into the node's output shape, always as arrays: a
// single output port collects the values directly; multiple ports collect a
// per-port array (each result must be an object keyed by port id, as routeOutput
// requires). The result is then routed through routeOutput unchanged.
const collectPerItemOutput = (node: Node, results: unknown[]): unknown => {
  const outputPorts = node.ports.filter((p) => p.side === 'output')
  if (outputPorts.length <= 1) return results
  const collected: Record<string, unknown> = {}
  for (const port of outputPorts) {
    collected[port.id] = results.map((r) => {
      if (!isPlainObject(r)) {
        throw createError(ERROR_CODE.RUNTIME_MULTI_PORT_MISMATCH, {
          nodeType: node.type,
          portCount: outputPorts.length,
          portList: outputPorts.map((p) => p.id).join(', '),
        })
      }
      return r[port.id]
    })
  }
  return collected
}

const safeStringify = (value: unknown): string | undefined => {
  if (value === undefined) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const summarizeNodeErrors = (
  errors: Array<{ nodeId: string; error: WayflowErrorPayload }>,
): WayflowErrorPayload | undefined => {
  if (errors.length === 0) return undefined
  if (errors.length === 1) {
    return {
      code: errors[0].error.code,
      message: `Node ${errors[0].nodeId} failed: ${errors[0].error.message}`,
      hint: errors[0].error.hint,
      docsUrl: errors[0].error.docsUrl,
    }
  }
  const summary = errors
    .map((e) => `${e.nodeId}: ${e.error.message}`)
    .join('; ')
  return createError(ERROR_CODE.RUNTIME_MULTIPLE_NODES_FAILED, {
    count: errors.length,
    summary,
  }).toJSON()
}

const truncateValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return value
  // An image data: URI is media to render, not text to read — and the result
  // carries it in full regardless — so leave it whole for the preview.
  if (typeof value === 'string' && value.startsWith('data:image/')) return value
  const serialized =
    typeof value === 'string' ? value : (safeStringify(value) ?? '')
  if (serialized.length <= TRUNCATION_LIMIT) return value
  const marker: TruncatedValue = {
    __truncated: true,
    size: serialized.length,
    preview: serialized.slice(0, TRUNCATION_PREVIEW),
  }
  return marker
}

const truncateRecord = (
  record: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    out[key] = truncateValue(value)
  }
  return out
}
