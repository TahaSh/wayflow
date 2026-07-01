import { detectCycle, type Graph, NODE_STATUS } from '@wayflow/core'
import { createWarning, ERROR_CODE, type ValidationWarning } from './error'
import { isTruncatedValue, type RunDataEntry } from './execution'
import type { Field, NodeTypeRegistry } from './node-types'
import type { ToolMetadata } from './tools'

const INPUT_TYPE = 'input'
const OUTPUT_TYPE = 'output'

export const validateGraph = (
  graph: Graph,
  registry: NodeTypeRegistry,
  toolCatalog: Record<string, ToolMetadata> = {},
): ValidationWarning[] => {
  const nodes = Object.values(graph.nodes)
  const edges = Object.values(graph.edges)
  if (nodes.length === 0) return []

  const warnings: ValidationWarning[] = []

  const cycle = detectCycle(graph)
  if (cycle) {
    warnings.push(
      createWarning(
        ERROR_CODE.RUNTIME_CYCLE_DETECTED,
        { path: cycle.join(' → ') },
        [...new Set(cycle)],
      ),
    )
  }

  if (!nodes.some((n) => n.type === INPUT_TYPE)) {
    warnings.push(createWarning(ERROR_CODE.VALIDATION_NO_INPUT_NODE))
  }
  if (!nodes.some((n) => n.type === OUTPUT_TYPE)) {
    warnings.push(createWarning(ERROR_CODE.VALIDATION_NO_OUTPUT_NODE))
  }

  for (const [type, def] of Object.entries(registry)) {
    if (!def.unique) continue
    const ofType = nodes.filter((n) => n.type === type)
    if (ofType.length > 1) {
      warnings.push(
        createWarning(
          ERROR_CODE.VALIDATION_DUPLICATE_UNIQUE_NODE,
          { label: def.label },
          ofType.map((n) => n.id),
        ),
      )
    }
  }

  // A lone node is expected mid-build — only flag orphans in a larger graph.
  if (nodes.length > 1) {
    const touched = new Set<string>()
    for (const edge of edges) {
      touched.add(edge.sourceNodeId)
      touched.add(edge.targetNodeId)
    }
    for (const node of nodes) {
      if (!touched.has(node.id)) {
        warnings.push(
          createWarning(ERROR_CODE.VALIDATION_ORPHAN_NODE, undefined, [
            node.id,
          ]),
        )
      }
    }
  }

  for (const node of nodes) {
    const validate = registry[node.type]?.validate
    if (!validate) continue
    const connectedPortIds = new Set<string>()
    for (const edge of edges) {
      if (edge.sourceNodeId === node.id) connectedPortIds.add(edge.sourcePortId)
      if (edge.targetNodeId === node.id) connectedPortIds.add(edge.targetPortId)
    }
    warnings.push(...validate(node, { connectedPortIds, toolCatalog }))
  }

  return warnings
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Run-result validation
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// `any` and unknown custom types pass — they can't be meaningfully checked.
const matchesDataType = (value: unknown, dataType: string): boolean => {
  switch (dataType) {
    case 'string':
    case 'image':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'json':
      return typeof value === 'object' && value !== null
    default:
      return true
  }
}

const describeType = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// Checks each completed Output node's result against its declared field types —
// did the run honour the contract a caller executing the workflow expects?
export const validateRunResults = (
  graph: Graph,
  runData: Record<string, RunDataEntry>,
): ValidationWarning[] => {
  const warnings: ValidationWarning[] = []

  for (const node of Object.values(graph.nodes)) {
    if (node.type !== OUTPUT_TYPE) continue
    const entry = runData[node.id]
    if (entry?.status !== NODE_STATUS.COMPLETE) continue
    const result = entry.outputData
    if (typeof result !== 'object' || result === null) continue

    // Fields fed by a branch (a rejected gate, a conditional) are legitimately
    // empty when that branch didn't fire — only an unwired field is a mistake.
    const connectedPortIds = new Set(
      Object.values(graph.edges)
        .filter((edge) => edge.targetNodeId === node.id)
        .map((edge) => edge.targetPortId),
    )

    const fields = (node.data.fields as Field[] | undefined) ?? []
    for (const field of fields) {
      const value = (result as Record<string, unknown>)[field.name]
      if (value === undefined) {
        if (!connectedPortIds.has(field.name)) {
          warnings.push(
            createWarning(
              ERROR_CODE.VALIDATION_OUTPUT_FIELD_MISSING,
              { name: field.name },
              [node.id],
            ),
          )
        }
        continue
      }
      if (isTruncatedValue(value)) continue
      if (!matchesDataType(value, field.dataType)) {
        warnings.push(
          createWarning(
            ERROR_CODE.VALIDATION_OUTPUT_TYPE_MISMATCH,
            {
              name: field.name,
              expected: field.dataType,
              actual: describeType(value),
            },
            [node.id],
          ),
        )
      }
    }
  }

  return warnings
}
