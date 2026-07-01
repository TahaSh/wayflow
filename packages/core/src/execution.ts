export const NODE_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  WAITING: 'waiting',
} as const

export type NodeStatus = (typeof NODE_STATUS)[keyof typeof NODE_STATUS]
export const NODE_STATUSES = Object.values(NODE_STATUS) as readonly NodeStatus[]

export const EDGE_STATUS = {
  IDLE: 'idle',
  ACTIVE: 'active',
  SKIPPED: 'skipped',
} as const

export type EdgeStatus = (typeof EDGE_STATUS)[keyof typeof EDGE_STATUS]
export const EDGE_STATUSES = Object.values(EDGE_STATUS) as readonly EdgeStatus[]
