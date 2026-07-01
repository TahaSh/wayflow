import type { Graph, Node } from '@wayflow/core'
import type { RuntimeEvent } from './protocol'
import type { Tool } from './tools'

export interface HandlerContext {
  signal: AbortSignal
  emit: (event: RuntimeEvent) => void
  // Caller-supplied inputs from runtime.run/stream({ inputs }).
  inputs: Record<string, unknown>
  // Contributes fields to the run's final shaped result. Last-write-wins on conflict.
  collectAsResult: (fields: Record<string, unknown>) => void
  // Replaces the inputs shown for this node in run views with the values the
  // handler actually used (e.g. resolved variable defaults).
  reportInputs: (inputs: Record<string, unknown>) => void
  // Subset of runtime.tools matching the node's tools-select config.
  tools: Record<string, Tool>
  // Runs a sub-graph on this same engine (a workflow exposed as a tool),
  // inheriting this run's cancellation signal. Resolves to the sub-run's
  // result; a nested run cannot pause.
  runGraph: (
    graph: Graph,
    inputs?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}

/**
 * Returns Promise<T> for one-shot, or `async function*` to stream — each
 * yield emits a `node_chunk` event; yielded values are stringified and
 * concatenated into the node's final output.
 *
 * `inputs` is keyed by the receiving node's input port id.
 */
export type Handler = (
  node: Node,
  inputs: Record<string, unknown>,
  ctx: HandlerContext,
) => Promise<unknown> | AsyncIterable<unknown>
