import type { NodeTypeRegistry } from './node-types'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Registry Override Helper
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const withLLMModels = (
  registry: NodeTypeRegistry,
  models: string[],
): NodeTypeRegistry => {
  const llm = registry.llm
  if (!llm) return registry
  const modelField = llm.configSchema.model
  if (!modelField) return registry
  return {
    ...registry,
    llm: {
      ...llm,
      configSchema: {
        ...llm.configSchema,
        model: {
          ...modelField,
          options: models,
          default: models[0] ?? modelField.default,
        },
      },
    },
  }
}
