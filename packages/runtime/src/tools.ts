import type { ToolMetadata } from '@wayflow/agent'
import type { Graph } from '@wayflow/core'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ToolHandlerContext {
  signal: AbortSignal
  // Runs a sub-graph on the same engine — lets a workflow exposed as a tool
  // execute when an LLM calls it. Inherits the caller's cancellation signal.
  runGraph: (
    graph: Graph,
    inputs?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
) => Promise<unknown>

export interface Tool extends ToolMetadata {
  handler: ToolHandler
}
