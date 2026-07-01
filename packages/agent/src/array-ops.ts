import type { CompareOperator } from './operators'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Operations
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// The Array Operations node transforms one list. Operations split into two
// shapes: reducing (a list collapses to a single value) and reshaping (a list
// becomes a smaller or reordered list).
export const ARRAY_OP = {
  COUNT: 'count',
  SUM: 'sum',
  JOIN: 'join',
  FIRST: 'first',
  LAST: 'last',
  TAKE: 'take',
  SLICE: 'slice',
  FILTER: 'filter',
  SORT: 'sort',
  UNIQUE: 'unique',
  PLUCK: 'pluck',
} as const

export type ArrayOpName = (typeof ARRAY_OP)[keyof typeof ARRAY_OP]

export const ARRAY_OP_NAMES: ArrayOpName[] = Object.values(ARRAY_OP)

// Operations whose result is a single value rather than a list — their output
// port is no longer list-shaped, which the preset uses to type the port.
export const REDUCING_OPS: ArrayOpName[] = [
  ARRAY_OP.COUNT,
  ARRAY_OP.SUM,
  ARRAY_OP.JOIN,
  ARRAY_OP.FIRST,
  ARRAY_OP.LAST,
]

export const SORT_DIRECTION = {
  ASC: 'asc',
  DESC: 'desc',
} as const

export type SortDirection = (typeof SORT_DIRECTION)[keyof typeof SORT_DIRECTION]

// The value stored under the node's `operation` config key. Only the params
// relevant to `op` are read; the rest are ignored.
export interface ArrayOpConfig {
  op: ArrayOpName
  separator?: string
  field?: string
  count?: number
  start?: number
  end?: number
  operator?: CompareOperator
  value?: string
  direction?: SortDirection
}

export const DEFAULT_ARRAY_OP: ArrayOpConfig = { op: ARRAY_OP.COUNT }
