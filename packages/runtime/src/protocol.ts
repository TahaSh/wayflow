import type { WayflowErrorPayload } from '@wayflow/agent'
import type { EdgeStatus, NodeStatus } from '@wayflow/core'

export const RUN_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Suspension (human-in-the-loop pause)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// An opaque resume token. The host stores it and hands it back to resume() —
// it never inspects the contents. A JSON snapshot of the scheduler's state
// (completed-node outputs, the frontier, the pending node) plus a structural
// fingerprint of the graph that produced it.
export interface Checkpoint {
  runId: string
  outputs: Record<string, unknown>
  completed: string[]
  failed: string[]
  result: Record<string, unknown>
  pending: string
  fingerprint: string
}

// What a human reviews at a pause — safe to hand to any client (no checkpoint).
export interface PendingReview {
  runId: string
  nodeId: string
  instructions: string
  data: unknown
}

// The host-facing envelope for a pause: the review plus the checkpoint needed to
// continue. The runtime always sets `checkpoint`; a host may hold it out-of-band
// and forward only the review to an untrusted client.
export interface Suspension extends PendingReview {
  checkpoint?: Checkpoint
}

// Each already-finished node's output — lets a freshly-loaded editor redraw the
// run so far on re-attach. Holds node outputs, so serve it only to trusted UIs.
export interface RunSnapshot {
  nodes: Array<{ nodeId: string; outputData: unknown }>
}

// A waiting run as a UI re-attaches to it: the review plus the run so far. The
// host may drop `snapshot` before serving an untrusted client.
export interface PendingRun extends PendingReview {
  snapshot?: RunSnapshot
}

// Discriminated by `status` so consumers narrowing by status get the right
// required fields (e.g., result on completed, error on error).
export type RunStatusData =
  | { status: typeof RUN_STATUS.RUNNING; runId: string }
  | {
      status: typeof RUN_STATUS.COMPLETED
      result: Record<string, unknown>
    }
  | { status: typeof RUN_STATUS.ERROR; error: WayflowErrorPayload }
  | {
      status: typeof RUN_STATUS.CANCELLED
      result: Record<string, unknown>
    }
  | { status: typeof RUN_STATUS.PAUSED; suspension: Suspension }

export type RuntimeEvent =
  | { event: 'run_status'; data: RunStatusData }
  | {
      event: 'node_status'
      data: {
        nodeId: string
        status: NodeStatus
        error?: WayflowErrorPayload
        outputData?: unknown
        inputs?: Record<string, unknown>
        startedAt?: number
        finishedAt?: number
      }
    }
  | { event: 'edge_status'; data: { edgeId: string; status: EdgeStatus } }
  | {
      event: 'node_chunk'
      data: { nodeId: string; delta: string; content: string }
    }
  | {
      event: 'tool_call_start'
      data: {
        nodeId: string
        callId: string
        tool: string
        args: Record<string, unknown>
      }
    }
  | {
      event: 'tool_call_end'
      data: {
        nodeId: string
        callId: string
        result?: unknown
        error?: WayflowErrorPayload
        durationMs: number
      }
    }
