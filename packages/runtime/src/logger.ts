import type { Logger } from '@wayflow/agent'
import type { Graph } from '@wayflow/core'
import { NODE_STATUS } from '@wayflow/core'
import { RUN_STATUS, type RuntimeEvent } from './protocol'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Event tap
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

// Yields every event through untouched while writing a readable trace. The
// logger is a pure consumer of the protocol, so the scheduler stays unaware of
// it. node_chunk is left unlogged: it is a per-token event that would bury the
// trace.
export async function* attachLogger(
  events: AsyncIterable<RuntimeEvent>,
  graph: Graph,
  logger: Logger,
): AsyncIterable<RuntimeEvent> {
  let runId: string | undefined
  let runStartedAt: number | undefined
  const nodeStartedAt = new Map<string, number>()

  const base = (): Record<string, unknown> => ({ runId })
  const label = (nodeId: string): string => {
    const node = graph.nodes[nodeId]
    const handle = node?.name ? `"${node.name}"` : nodeId
    return node?.type ? `${node.type} ${handle}` : handle
  }
  const nodeBase = (nodeId: string): Record<string, unknown> => ({
    runId,
    nodeId,
  })
  const since = (startedAt?: number): Record<string, unknown> =>
    startedAt === undefined
      ? {}
      : { duration: formatDuration(Date.now() - startedAt) }

  try {
    for await (const event of events) {
      switch (event.event) {
        case 'run_status': {
          const { data } = event
          if (data.status === RUN_STATUS.RUNNING) {
            runId = data.runId
            runStartedAt = Date.now()
            logger.info('run started', base())
          } else if (data.status === RUN_STATUS.COMPLETED) {
            logger.info('run completed', { ...base(), ...since(runStartedAt) })
          } else if (data.status === RUN_STATUS.PAUSED) {
            logger.info('run paused', {
              ...base(),
              nodeId: data.suspension.nodeId,
            })
          } else if (data.status === RUN_STATUS.CANCELLED) {
            logger.warn('run cancelled', { ...base(), ...since(runStartedAt) })
          } else if (data.status === RUN_STATUS.ERROR) {
            logger.error('run failed', {
              ...base(),
              code: data.error.code,
              message: data.error.message,
            })
          }
          break
        }
        case 'node_status': {
          const { data } = event
          if (data.status === NODE_STATUS.RUNNING) {
            if (data.startedAt !== undefined)
              nodeStartedAt.set(data.nodeId, data.startedAt)
            logger.debug(
              `node ${label(data.nodeId)} started`,
              nodeBase(data.nodeId),
            )
          } else if (data.status === NODE_STATUS.COMPLETE) {
            logger.debug(`node ${label(data.nodeId)} completed`, {
              ...nodeBase(data.nodeId),
              ...since(nodeStartedAt.get(data.nodeId)),
            })
          } else if (data.status === NODE_STATUS.ERROR) {
            logger.error(`node ${label(data.nodeId)} failed`, {
              ...nodeBase(data.nodeId),
              code: data.error?.code,
              message: data.error?.message,
            })
          } else if (data.status === NODE_STATUS.WAITING) {
            logger.debug(
              `node ${label(data.nodeId)} waiting`,
              nodeBase(data.nodeId),
            )
          }
          break
        }
        case 'tool_call_start': {
          const { data } = event
          logger.debug(`tool ${data.tool} called`, {
            ...base(),
            nodeId: data.nodeId,
          })
          break
        }
        case 'tool_call_end': {
          const { data } = event
          if (data.error) {
            logger.error(`tool failed`, {
              ...base(),
              nodeId: data.nodeId,
              code: data.error.code,
              message: data.error.message,
              duration: formatDuration(data.durationMs),
            })
          } else {
            logger.debug('tool finished', {
              ...base(),
              nodeId: data.nodeId,
              duration: formatDuration(data.durationMs),
            })
          }
          break
        }
      }
      yield event
    }
  } catch (err) {
    logger.error('run threw', {
      ...base(),
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
