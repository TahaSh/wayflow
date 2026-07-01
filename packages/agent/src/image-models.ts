import type { NodeTypeRegistry } from './node-types'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Registry Override Helper
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const withImageModels = (
  registry: NodeTypeRegistry,
  models: string[],
): NodeTypeRegistry => {
  const node = registry.imageGeneration
  if (!node) return registry
  const modelField = node.configSchema.model
  if (!modelField) return registry
  return {
    ...registry,
    imageGeneration: {
      ...node,
      configSchema: {
        ...node.configSchema,
        model: {
          ...modelField,
          options: models,
          default: models[0] ?? modelField.default,
        },
      },
    },
  }
}
