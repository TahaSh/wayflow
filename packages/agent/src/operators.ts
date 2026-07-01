// Comparison operators shared by the Conditional node and Array Operations
// `filter`. The runtime owns the actual comparison; this is the vocabulary.

export const COMPARE_OPERATOR = {
  EQ: '==',
  NEQ: '!=',
  GT: '>',
  LT: '<',
  GTE: '>=',
  LTE: '<=',
  CONTAINS: 'contains',
  STARTS_WITH: 'startsWith',
  ENDS_WITH: 'endsWith',
  MATCHES: 'matches',
} as const

export type CompareOperator =
  (typeof COMPARE_OPERATOR)[keyof typeof COMPARE_OPERATOR]

export const COMPARE_OPERATORS: CompareOperator[] =
  Object.values(COMPARE_OPERATOR)
