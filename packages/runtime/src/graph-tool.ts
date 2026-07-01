import {
  createError,
  ERROR_CODE,
  type Field,
  isFieldRequired,
  isFieldValueEmpty,
  type JsonSchema,
} from '@wayflow/agent'
import { type Graph, toSnakeCase } from '@wayflow/core'
import type { Tool } from './tools'

export interface GraphToToolOptions {
  description?: string
}

// Nameless by design: the tool's name is the key it's registered under.
// Use graphsToTools to key several graphs by their own names.
export const graphToTool = (
  graph: Graph,
  options?: GraphToToolOptions,
): Tool => ({
  description: options?.description ?? graph.metadata?.description ?? '',
  parameters: schemaFromInputFields(graph),
  handler: (args, ctx) => ctx.runGraph(graph, args),
})

// The host filters to the workflows it wants to expose before calling.
export const graphsToTools = (graphs: Graph[]): Record<string, Tool> => {
  const tools: Record<string, Tool> = {}
  for (const graph of graphs) {
    const name = toSnakeCase(graph.metadata?.name)
    if (!name) throw createError(ERROR_CODE.RUNTIME_TOOL_NO_NAME)
    tools[name] = graphToTool(graph)
  }
  return tools
}

const schemaFromInputFields = (graph: Graph): JsonSchema => {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const node of Object.values(graph.nodes)) {
    if (node.type !== 'input') continue
    const fields = node.data.fields as Field[] | undefined
    if (!Array.isArray(fields)) continue
    for (const f of fields) {
      properties[f.name] = jsonSchemaForDataType(f.dataType)
      // Required for the tool only when the workflow requires it and it has no
      // default for the model to fall back on.
      if (isFieldRequired(f) && isFieldValueEmpty(f.default)) {
        required.push(f.name)
      }
    }
  }

  return { type: 'object', properties, required }
}

const jsonSchemaForDataType = (dataType: string): JsonSchema => {
  if (dataType === 'string') return { type: 'string' }
  if (dataType === 'number') return { type: 'number' }
  if (dataType === 'boolean') return { type: 'boolean' }
  // 'json' / 'any' / unknown custom types accept any JSON value.
  return {}
}
