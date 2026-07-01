import { type Graph, PORT_SIDE } from '@wayflow/core'
import {
  type Checkpoint,
  type PendingReview,
  type PendingRun,
  RUN_STATUS,
  type RunSnapshot,
  type RuntimeEvent,
  type Suspension,
} from './protocol'
import {
  type Decision,
  drainToOutcome,
  type RunOptions,
  type RunOutcome,
  type Runtime,
} from './runtime'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Checkpoint store
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// What resume needs: the suspension plus the graph it paused on.
export interface CheckpointRecord {
  graph: Graph
  suspension: Suspension
}

// Where paused runs live between request and resume. Provide one to swap out the
// in-memory default; nothing else changes.
export interface CheckpointStore {
  save(runId: string, record: CheckpointRecord): void | Promise<void>
  load(
    runId: string,
  ): CheckpointRecord | undefined | Promise<CheckpointRecord | undefined>
  delete(runId: string): void | Promise<void>
  // All stored records — powers a pending-reviews inbox.
  list(): CheckpointRecord[] | Promise<CheckpointRecord[]>
}

export const createMemoryCheckpointStore = (): CheckpointStore => {
  const records = new Map<string, CheckpointRecord>()
  return {
    save: (runId, record) => void records.set(runId, record),
    load: (runId) => records.get(runId),
    delete: (runId) => void records.delete(runId),
    list: () => [...records.values()],
  }
}

const toPendingReview = ({
  checkpoint,
  ...review
}: Suspension): PendingReview => review

const toPendingRun = ({ graph, suspension }: CheckpointRecord): PendingRun => ({
  ...toPendingReview(suspension),
  snapshot: suspension.checkpoint
    ? buildSnapshot(graph, suspension.checkpoint)
    : undefined,
})

// Rebuilds each finished node's output from the checkpoint so a reloaded editor
// can redraw the run so far.
const buildSnapshot = (graph: Graph, checkpoint: Checkpoint): RunSnapshot => {
  const nodes: RunSnapshot['nodes'] = []
  for (const nodeId of checkpoint.completed) {
    const node = graph.nodes[nodeId]
    if (!node) continue
    const outputs = node.ports.filter((p) => p.side === PORT_SIDE.OUTPUT)
    let outputData: unknown
    if (outputs.length === 1) {
      outputData = checkpoint.outputs[`${nodeId}:${outputs[0].id}`]
    } else {
      const byPort: Record<string, unknown> = {}
      for (const port of outputs) {
        const key = `${nodeId}:${port.id}`
        if (key in checkpoint.outputs) byPort[port.id] = checkpoint.outputs[key]
      }
      if (Object.keys(byPort).length > 0) outputData = byPort
    }
    nodes.push({ nodeId, outputData })
  }
  return { nodes }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Run sessions
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ResumeRequest {
  runId: string
  decision: Decision
  signal?: AbortSignal
}

export interface RunSessions {
  // One-shot: runs to its first outcome (completed or paused), storing the
  // checkpoint on a pause. For non-streaming triggers (cron, queue, JSON
  // endpoint). The paused outcome carries the runId, not the checkpoint.
  run<R extends Record<string, unknown> = Record<string, unknown>>(
    graph: Graph,
    options?: RunOptions,
  ): Promise<RunOutcome<R>>
  // Streaming: yields events as the run executes, storing + stripping the
  // checkpoint on a pause. Wrap in your server's transport (streamResponse / writeSSE).
  stream(graph: Graph, options?: RunOptions): AsyncIterable<RuntimeEvent>
  // One-shot resume by runId → the next outcome, or null if the runId is unknown.
  resume<R extends Record<string, unknown> = Record<string, unknown>>(
    request: ResumeRequest,
  ): Promise<RunOutcome<R> | null>
  // Streaming resume by runId, or null if the runId is unknown/already resumed.
  resumeStream(
    request: ResumeRequest,
  ): Promise<AsyncIterable<RuntimeEvent> | null>
  // Drops a paused run's checkpoint without resuming (e.g. the human cancelled).
  cancel(runId: string): Promise<void>
  // Every waiting run (review + run-so-far, no checkpoints) — powers a "what's
  // awaiting me" inbox and the editor's re-attach.
  listPending(): Promise<PendingRun[]>
  // One waiting run by runId, or null. Lets a UI re-show a card it lost.
  getPending(runId: string): Promise<PendingRun | null>
}

export interface CreateRunSessionsOptions {
  store?: CheckpointStore
}

export const createRunSessions = (
  runtime: Runtime,
  { store = createMemoryCheckpointStore() }: CreateRunSessionsOptions = {},
): RunSessions => {
  // Keeps the checkpoint server-side and strips it from the pause forwarded to
  // the client, which resumes by runId. A pause after resume re-stores under the
  // same runId, so sequential gates work without extra wiring.
  const persistPauses = async function* (
    events: AsyncIterable<RuntimeEvent>,
    graph: Graph,
  ): AsyncIterable<RuntimeEvent> {
    for await (const evt of events) {
      if (evt.event === 'run_status' && evt.data.status === RUN_STATUS.PAUSED) {
        const full = evt.data.suspension
        if (full.checkpoint)
          await store.save(full.runId, { graph, suspension: full })
        yield {
          event: 'run_status',
          data: {
            status: RUN_STATUS.PAUSED,
            suspension: toPendingReview(full),
          },
        }
      } else {
        yield evt
      }
    }
  }

  const stream = (graph: Graph, options?: RunOptions) =>
    persistPauses(runtime.stream(graph, options), graph)

  const resumeStream = async ({ runId, decision, signal }: ResumeRequest) => {
    const record = await store.load(runId)
    const checkpoint = record?.suspension.checkpoint
    if (!checkpoint) return null
    await store.delete(runId)
    return persistPauses(
      runtime.stream(record.graph, {
        resume: { checkpoint, decision },
        signal,
      }),
      record.graph,
    )
  }

  return {
    stream,
    run: <R extends Record<string, unknown>>(
      graph: Graph,
      options?: RunOptions,
    ) => drainToOutcome<R>(stream(graph, options)),

    resumeStream,
    resume: async <R extends Record<string, unknown>>(
      request: ResumeRequest,
    ) => {
      const events = await resumeStream(request)
      return events ? drainToOutcome<R>(events) : null
    },

    cancel: async (runId) => {
      await store.delete(runId)
    },

    listPending: async () => (await store.list()).map(toPendingRun),

    getPending: async (runId) => {
      const record = await store.load(runId)
      return record ? toPendingRun(record) : null
    },
  }
}
