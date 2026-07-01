import type { EdgeStatus, NodeStatus } from '@wayflow/core'
import type { WayflowErrorPayload } from './error'

/**
 * Anything that can visualize per-node and per-edge execution status.
 * `WorkflowEditor` implements this; custom editor surfaces can too.
 */
export interface ExecutionDriver {
  setNodeStatus(id: string, status: NodeStatus): void
  setEdgeStatus(id: string, status: EdgeStatus): void
  clearExecutionState(): void
}

/**
 * Anything that can produce a graph in the runtime's wire format.
 * Output is a JSON string consumable by `deserialize` from `@wayflow/core`.
 */
export interface GraphSource {
  export(): string
}

export const TOOL_CALL_STATUS = {
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const

export type ToolCallStatus =
  (typeof TOOL_CALL_STATUS)[keyof typeof TOOL_CALL_STATUS]

export interface ToolCallEntry {
  callId: string
  tool: string
  args: Record<string, unknown>
  status: ToolCallStatus
  result?: unknown
  error?: WayflowErrorPayload
  durationMs?: number
}

// The outcome a human picked at a review gate — distinct from the node's
// status (which is `complete` either way). Shown on the node and in Last-run.
export const REVIEW_DECISION = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ReviewDecision =
  (typeof REVIEW_DECISION)[keyof typeof REVIEW_DECISION]

export interface RunDataEntry {
  status: NodeStatus
  inputs?: Record<string, unknown>
  outputData?: unknown
  durationMs?: number
  error?: WayflowErrorPayload
  streamedText?: string
  toolCalls?: ToolCallEntry[]
  decision?: ReviewDecision
}

export interface TruncatedValue {
  __truncated: true
  size: number
  preview: string
}

export const isTruncatedValue = (value: unknown): value is TruncatedValue =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __truncated?: unknown }).__truncated === true

/**
 * Anything that can record per-node run data for later inspection.
 * Calls are partial — entries merge as `running` then `complete`/`error` events arrive.
 */
export interface RunRecorder {
  setNodeRunData(nodeId: string, partial: Partial<RunDataEntry>): void
}
