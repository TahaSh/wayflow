/// <reference lib="dom" />

import {
  createError,
  ERROR_CODE,
  type ExecutionDriver,
  type GraphSource,
  type RunRecorder,
  TOOL_CALL_STATUS,
  type ToolCallEntry,
  WayflowError,
  type WayflowErrorPayload,
} from '@wayflow/agent'
import {
  deserialize,
  EDGE_STATUS,
  type Graph,
  NODE_STATUS,
} from '@wayflow/core'
import {
  type PendingReview,
  type PendingRun,
  RUN_STATUS,
  type RunSnapshot,
  type RunStatus,
  type RuntimeEvent,
} from './protocol'
import { type Decision, REVIEW_BRANCH, type Runtime } from './runtime'
import { createRunSessions, type ResumeRequest } from './sessions'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Request configuration
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Which client request a RequestInitOption factory is being resolved for.
export const REQUEST_KIND = {
  RUN: 'run',
  RESUME: 'resume',
  CANCEL: 'cancel',
  PENDING: 'pending',
} as const

export type RequestKind = (typeof REQUEST_KIND)[keyof typeof REQUEST_KIND]

// Per-request fetch options for the HTTP client — auth headers, credentials, and
// the rest of RequestInit (the method and body stay the client's own). A function
// is resolved fresh for every request, so short-lived tokens stay current, and
// can branch on `kind` to vary by endpoint.
export type RequestInitOption =
  | RequestInit
  | ((ctx: { kind: RequestKind }) => RequestInit | Promise<RequestInit>)

const resolveInit = async (
  init: RequestInitOption | undefined,
  kind: RequestKind,
): Promise<RequestInit | undefined> =>
  typeof init === 'function' ? init({ kind }) : init

// Merges caller headers over the JSON default (rather than replacing it), passes
// the rest of init through (credentials, mode, …), and keeps the method, body,
// and signal the client controls.
const buildRequest = (
  method: 'GET' | 'POST',
  body: unknown,
  signal: AbortSignal | undefined,
  init: RequestInit | undefined,
): RequestInit => {
  const { headers: callerHeaders, ...rest } = init ?? {}
  const headers = new Headers(
    body === undefined ? undefined : { 'Content-Type': 'application/json' },
  )
  if (callerHeaders) {
    new Headers(callerHeaders).forEach((value, key) => headers.set(key, value))
  }
  return {
    ...rest,
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
    headers,
  }
}

export interface StreamOptions {
  url: string
  graph: string
  inputs?: Record<string, unknown>
  signal?: AbortSignal
  init?: RequestInit
}

export async function* stream(
  options: StreamOptions,
): AsyncIterable<RuntimeEvent> {
  yield* openStream(
    options.url,
    { graph: options.graph, inputs: options.inputs },
    options.signal,
    options.init,
  )
}

async function* openStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
  init?: RequestInit,
): AsyncIterable<RuntimeEvent> {
  const res = await fetch(url, buildRequest('POST', body, signal, init))
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw createError(ERROR_CODE.RUNTIME_HTTP_ERROR, {
      status: res.status,
      detail,
    })
  }
  yield* parseSSE(res.body)
}

async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<RuntimeEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (data) {
        yield { event, data: JSON.parse(data) } as RuntimeEvent
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

interface ConsumeHooks {
  editor: ExecutionDriver & RunRecorder
  signal?: AbortSignal
  onChunk?: (chunk: { nodeId: string; delta: string; content: string }) => void
  onRunStatus?: (status: RunStatus, error?: WayflowErrorPayload) => void
  onEvent?: (event: RuntimeEvent) => void
}

// An editor that can show an approval card and resolve the human's decision
// (null = cancelled). Structurally satisfied by the WorkflowEditor without ui
// depending on runtime. When present alongside resumeUrl, run() drives the
// pause → approve → resume loop itself.
export interface ApprovalDriver {
  requestApproval(request: {
    nodeId: string
    instructions: string
    data: unknown
    signal?: AbortSignal
  }): Promise<{ approved: boolean; data: unknown } | null>
}

export interface RunOptions extends ConsumeHooks {
  url: string
  resumeUrl?: string
  // Endpoint that drops a paused run's checkpoint when the human cancels.
  cancelUrl?: string
  editor: ExecutionDriver & GraphSource & RunRecorder & Partial<ApprovalDriver>
  graph?: string
  inputs?: Record<string, unknown>
  // Per-request fetch options (auth headers, credentials) for the run, resume,
  // and cancel calls. A function is resolved fresh per request.
  init?: RequestInitOption
}

export interface ResumeOptions extends ConsumeHooks {
  url: string
  runId: string
  decision: Decision
  init?: RequestInitOption
}

// What a paused run delivers to the client: the review payload, without the
// checkpoint (the server holds it and resumes by runId).
export type ClientSuspension = PendingReview

export type ClientRunOutcome<
  R extends Record<string, unknown> = Record<string, unknown>,
> =
  | { status: typeof RUN_STATUS.COMPLETED; result: R }
  | { status: typeof RUN_STATUS.PAUSED; suspension: ClientSuspension }

// Drives the editor's execution-state visualization while consuming the event
// stream and returns the outcome. Generic over R so callers can type the result
// shape they expect from their workflow's Output schema.
export const run = async <
  R extends Record<string, unknown> = Record<string, unknown>,
>(
  options: RunOptions,
): Promise<ClientRunOutcome<R>> => {
  const graph = options.graph ?? options.editor.export()
  options.editor.clearExecutionState()
  const outcome = await consume<R>(
    openStream(
      options.url,
      { graph, inputs: options.inputs },
      options.signal,
      await resolveInit(options.init, REQUEST_KIND.RUN),
    ),
    options,
  )
  return driveApprovals(outcome, options)
}

// An editor that can run a function inside its run-in-progress UI (Cancel
// button + status). Structurally satisfied by the WorkflowEditor.
export interface RunSessionDriver {
  runSession(fn: (signal: AbortSignal) => Promise<void>): Promise<void>
}

interface ApprovalLoopOptions extends ConsumeHooks {
  editor: ExecutionDriver &
    RunRecorder &
    Partial<ApprovalDriver> &
    Partial<RunSessionDriver>
  resumeUrl?: string
  cancelUrl?: string
  init?: RequestInitOption
}

// How the approval loop resumes a paused run and drops its checkpoint. Built
// from the HTTP endpoints (the SSE entry points) or from local run sessions
// (runInBrowser) — so the loop itself stays transport-agnostic.
interface ResumeTransport {
  resume(request: ResumeRequest): Promise<AsyncIterable<RuntimeEvent> | null>
  drop(runId: string): Promise<void>
}

const httpTransport = (
  options: ApprovalLoopOptions,
): ResumeTransport | undefined =>
  options.resumeUrl === undefined
    ? undefined
    : {
        resume: async ({ runId, decision }) =>
          openStream(
            options.resumeUrl!,
            { runId, decision },
            options.signal,
            await resolveInit(options.init, REQUEST_KIND.RESUME),
          ),
        // No signal — it's already aborted and would cancel this request too.
        drop: async (runId) => {
          if (!options.cancelUrl) return
          await fetch(
            options.cancelUrl,
            buildRequest(
              'POST',
              { runId },
              undefined,
              await resolveInit(options.init, REQUEST_KIND.CANCEL),
            ),
          ).catch(() => {})
        },
      }

// While the run is paused and the editor can show a card, own the
// pause → approve → resume loop (re-pausing for each further gate); otherwise
// hand the pause back to the caller.
const driveApprovals = async <R extends Record<string, unknown>>(
  outcome: ClientRunOutcome<R>,
  options: ApprovalLoopOptions,
  transport: ResumeTransport | undefined = httpTransport(options),
): Promise<ClientRunOutcome<R>> => {
  const requestApproval = options.editor.requestApproval
  while (outcome.status === RUN_STATUS.PAUSED && transport && requestApproval) {
    const { runId, nodeId, instructions, data } = outcome.suspension
    const decision = await requestApproval({
      nodeId,
      instructions,
      data,
      signal: options.signal,
    })
    if (!decision) {
      options.editor.setNodeStatus(nodeId, NODE_STATUS.CANCELLED)
      await transport.drop(runId)
      return outcome
    }
    const events = await transport.resume({
      runId,
      decision: {
        branch: decision.approved
          ? REVIEW_BRANCH.APPROVED
          : REVIEW_BRANCH.REJECTED,
        data: decision.data,
      },
      signal: options.signal,
    })
    if (!events) break
    outcome = await consume<R>(events, options)
  }
  // Paused with an approval-capable editor but no resume transport. Mark the
  // paused node failed so it surfaces like any node error, not just header text.
  if (outcome.status === RUN_STATUS.PAUSED && requestApproval && !transport) {
    const error = createError(ERROR_CODE.RUNTIME_REVIEW_NOT_RESUMABLE)
    options.editor.setNodeStatus(outcome.suspension.nodeId, NODE_STATUS.ERROR)
    options.editor.setNodeRunData(outcome.suspension.nodeId, {
      status: NODE_STATUS.ERROR,
      error: error.toJSON(),
    })
    throw error
  }
  return outcome
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Run in the browser (no server)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface RunInBrowserOptions extends ConsumeHooks {
  runtime: Runtime
  editor: ExecutionDriver &
    GraphSource &
    RunRecorder &
    Partial<ApprovalDriver> &
    Partial<RunSessionDriver>
  // Defaults to the editor's current graph.
  graph?: Graph
  inputs?: Record<string, unknown>
}

// Runs a graph entirely in the browser — no backend — driving the editor's
// execution visualization, exactly like the SSE `run` but powered by an
// in-process runtime. Pairs with createMockProvider for zero-network embeds.
export const runInBrowser = async <
  R extends Record<string, unknown> = Record<string, unknown>,
>(
  options: RunInBrowserOptions,
): Promise<ClientRunOutcome<R>> => {
  const sessions = createRunSessions(options.runtime)
  const graph = options.graph ?? deserialize(options.editor.export())
  options.editor.clearExecutionState()
  const outcome = await consume<R>(
    sessions.stream(graph, { inputs: options.inputs, signal: options.signal }),
    options,
  )
  return driveApprovals(outcome, options, {
    resume: (request) => sessions.resumeStream(request),
    drop: (runId) => sessions.cancel(runId),
  })
}

// Continues a paused run with the human's decision, keeping the current canvas
// state so the visualization carries on from where it paused.
export const resume = async <
  R extends Record<string, unknown> = Record<string, unknown>,
>(
  options: ResumeOptions,
): Promise<ClientRunOutcome<R>> =>
  consume<R>(
    openStream(
      options.url,
      { runId: options.runId, decision: options.decision },
      options.signal,
      await resolveInit(options.init, REQUEST_KIND.RESUME),
    ),
    options,
  )

export interface ResumePendingOptions extends ApprovalLoopOptions {
  resumeUrl: string
  review: PendingReview
  // Finished-node outputs to redraw before re-showing the card (the run so far).
  snapshot?: RunSnapshot
}

// Re-attaches to a pending review the editor lost (e.g. after a reload): redraws
// the finished nodes, marks the pending node waiting, and re-enters the
// approve → resume loop from it.
export const resumePending = <
  R extends Record<string, unknown> = Record<string, unknown>,
>(
  options: ResumePendingOptions,
): Promise<ClientRunOutcome<R>> => {
  for (const node of options.snapshot?.nodes ?? []) {
    options.editor.setNodeStatus(node.nodeId, NODE_STATUS.COMPLETE)
    options.editor.setNodeRunData(node.nodeId, {
      status: NODE_STATUS.COMPLETE,
      outputData: node.outputData,
    })
  }
  options.editor.setNodeStatus(options.review.nodeId, NODE_STATUS.WAITING)
  return driveApprovals<R>(
    { status: RUN_STATUS.PAUSED, suspension: options.review },
    options,
  )
}

export interface AttachPendingOptions extends ApprovalLoopOptions {
  // Endpoint returning the waiting runs to re-attach (already scoped to this
  // user/workflow by the host); each carries the review + run-so-far.
  pendingUrl: string
  resumeUrl: string
}

// Re-attaches every waiting run the server reports — call once when the editor
// loads to pick up reviews left waiting from an earlier session, redrawing the
// run so far. Runs inside the editor's run session (if any) so it's cancellable
// like a fresh run.
export const attachPending = async (
  options: AttachPendingOptions,
): Promise<void> => {
  const runs = (await fetch(
    options.pendingUrl,
    buildRequest(
      'GET',
      undefined,
      options.signal,
      await resolveInit(options.init, REQUEST_KIND.PENDING),
    ),
  ).then((r) => r.json())) as PendingRun[]
  if (runs.length === 0) return
  const resumeAll = async (signal: AbortSignal): Promise<void> => {
    for (const run of runs) {
      await resumePending({
        ...options,
        review: run,
        snapshot: run.snapshot,
        signal,
      })
    }
  }
  const runSession = options.editor.runSession
  if (runSession) await runSession(resumeAll)
  else await resumeAll(options.signal ?? new AbortController().signal)
}

const consume = async <R extends Record<string, unknown>>(
  events: AsyncIterable<RuntimeEvent>,
  options: ConsumeHooks,
): Promise<ClientRunOutcome<R>> => {
  let result: Record<string, unknown> = {}
  let suspension: ClientSuspension | undefined
  const startedAt = new Map<string, number>()
  // Track in-flight visual state so we can settle it locally if fetch aborts
  // before the server's final node/edge events reach us.
  const runningNodes = new Set<string>()
  const activeEdges = new Set<string>()
  // Per-node tool-call accumulator. setNodeRunData merges by overwrite, so we
  // rewrite the full array on every start/end.
  const toolCallsByNode = new Map<string, ToolCallEntry[]>()

  try {
    for await (const evt of events) {
      switch (evt.event) {
        case 'node_status': {
          const { nodeId, status } = evt.data
          options.editor.setNodeStatus(nodeId, status)
          if (status === NODE_STATUS.RUNNING) runningNodes.add(nodeId)
          else runningNodes.delete(nodeId)
          const partial: Record<string, unknown> = { status }
          if (evt.data.inputs !== undefined) partial.inputs = evt.data.inputs
          if (evt.data.outputData !== undefined)
            partial.outputData = evt.data.outputData
          if (evt.data.error !== undefined) partial.error = evt.data.error
          if (evt.data.startedAt !== undefined)
            startedAt.set(nodeId, evt.data.startedAt)
          if (evt.data.finishedAt !== undefined) {
            const start = startedAt.get(nodeId)
            if (start !== undefined)
              partial.durationMs = evt.data.finishedAt - start
            startedAt.delete(nodeId)
          }
          options.editor.setNodeRunData(nodeId, partial)
          break
        }
        case 'edge_status':
          options.editor.setEdgeStatus(evt.data.edgeId, evt.data.status)
          if (evt.data.status === EDGE_STATUS.ACTIVE)
            activeEdges.add(evt.data.edgeId)
          else activeEdges.delete(evt.data.edgeId)
          break
        case 'node_chunk':
          options.editor.setNodeRunData(evt.data.nodeId, {
            streamedText: evt.data.content,
          })
          options.onChunk?.(evt.data)
          break
        case 'tool_call_start': {
          const { nodeId, callId, tool, args } = evt.data
          const calls = toolCallsByNode.get(nodeId) ?? []
          calls.push({ callId, tool, args, status: TOOL_CALL_STATUS.RUNNING })
          toolCallsByNode.set(nodeId, calls)
          options.editor.setNodeRunData(nodeId, { toolCalls: [...calls] })
          break
        }
        case 'tool_call_end': {
          const {
            nodeId,
            callId,
            result: callResult,
            error,
            durationMs,
          } = evt.data
          const calls = toolCallsByNode.get(nodeId) ?? []
          const idx = calls.findIndex((c) => c.callId === callId)
          if (idx !== -1) {
            calls[idx] = {
              ...calls[idx],
              status: error
                ? TOOL_CALL_STATUS.ERROR
                : TOOL_CALL_STATUS.COMPLETE,
              result: callResult,
              error,
              durationMs,
            }
            options.editor.setNodeRunData(nodeId, { toolCalls: [...calls] })
          }
          break
        }
        case 'run_status':
          if (evt.data.status === RUN_STATUS.ERROR) {
            options.onRunStatus?.(RUN_STATUS.ERROR, evt.data.error)
            throw new WayflowError(evt.data.error)
          }
          if (evt.data.status === RUN_STATUS.CANCELLED) {
            options.onRunStatus?.(RUN_STATUS.CANCELLED)
            throw new DOMException('The run was cancelled.', 'AbortError')
          }
          if (evt.data.status === RUN_STATUS.PAUSED) {
            const { runId, nodeId, instructions, data } = evt.data.suspension
            suspension = { runId, nodeId, instructions, data }
            options.onRunStatus?.(RUN_STATUS.PAUSED)
          } else if (evt.data.status === RUN_STATUS.COMPLETED) {
            result = evt.data.result
            options.onRunStatus?.(RUN_STATUS.COMPLETED)
          } else {
            options.onRunStatus?.(RUN_STATUS.RUNNING)
          }
          break
      }
      options.onEvent?.(evt)
    }
  } catch (err) {
    // Fetch teardown can drop the server's final settle events. Sweep any
    // in-flight state to cancelled/idle so the canvas reflects the abort.
    if (err instanceof Error && err.name === 'AbortError') {
      const finishedAt = Date.now()
      for (const nodeId of runningNodes) {
        options.editor.setNodeStatus(nodeId, NODE_STATUS.CANCELLED)
        const start = startedAt.get(nodeId)
        const partial: Record<string, unknown> = {
          status: NODE_STATUS.CANCELLED,
        }
        if (start !== undefined) partial.durationMs = finishedAt - start
        options.editor.setNodeRunData(nodeId, partial)
      }
      for (const edgeId of activeEdges) {
        options.editor.setEdgeStatus(edgeId, EDGE_STATUS.IDLE)
      }
    }
    throw err
  }

  return suspension
    ? { status: RUN_STATUS.PAUSED, suspension }
    : { status: RUN_STATUS.COMPLETED, result: result as R }
}
