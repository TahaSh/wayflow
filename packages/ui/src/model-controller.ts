import {
  type Logger,
  type NodeTypeRegistry,
  withImageModels,
  withLLMModels,
} from '@wayflow/agent'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const MODEL_NODE_TYPES = {
  llm: 'llm',
  imageGeneration: 'imageGeneration',
} as const

type ModelKind = (typeof MODEL_NODE_TYPES)[keyof typeof MODEL_NODE_TYPES]

const MODEL_OVERRIDERS: Record<
  ModelKind,
  (registry: NodeTypeRegistry, models: string[]) => NodeTypeRegistry
> = { llm: withLLMModels, imageGeneration: withImageModels }

const OPTION_NAME: Record<ModelKind, string> = {
  llm: 'llm.models',
  imageGeneration: 'imageGeneration.models',
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A model list, or an async loader the controller awaits (showing a loading
// state on the relevant node until it resolves).
export type ModelsOption = string[] | (() => Promise<string[]>)

export interface ModelAvailability {
  available: boolean
  loading: boolean
  reason?: string
}

export interface ModelController {
  // undefined for node types that don't take a model; otherwise whether the type
  // can be used and, when not, a human-readable reason for the disabled state.
  getAvailability: (type: string) => ModelAvailability | undefined
  setModels: (models: { llm?: string[]; imageGeneration?: string[] }) => void
  onChange: (callback: () => void) => () => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Owns the selectable models for model-bearing node types. Availability is read
// live from each node's `model` field options, so a single in-place patch of the
// registry is all it takes to refresh the palette and any open config panel.

export const createModelController = (
  registry: NodeTypeRegistry,
  sources: { llm?: ModelsOption; imageGeneration?: ModelsOption } = {},
  log?: Logger,
): ModelController => {
  const loading = new Set<ModelKind>()
  const warned = new Set<ModelKind>()
  const listeners = new Set<() => void>()
  let destroyed = false

  const emit = (): void => {
    for (const listener of listeners) listener()
  }

  const optionsFor = (type: string): string[] =>
    registry[type]?.configSchema.model?.options ?? []

  const nodeTypeForKind = (kind: ModelKind): string | undefined =>
    (Object.keys(MODEL_NODE_TYPES) as (keyof typeof MODEL_NODE_TYPES)[]).find(
      (type) => MODEL_NODE_TYPES[type] === kind && registry[type],
    )

  const warnIfEmpty = (kind: ModelKind): void => {
    if (warned.has(kind) || loading.has(kind)) return
    const type = nodeTypeForKind(kind)
    if (!type || optionsFor(type).length > 0) return
    warned.add(kind)
    log?.warn(
      `No models configured for ${type} nodes — the node is disabled. ` +
        `Pass \`${OPTION_NAME[kind]}\` to createWorkflowEditor() ` +
        `(a string[] or an async () => Promise<string[]>).`,
    )
  }

  const apply = (kind: ModelKind, models: string[]): void => {
    Object.assign(registry, MODEL_OVERRIDERS[kind](registry, models))
    loading.delete(kind)
    warnIfEmpty(kind)
    emit()
  }

  const init = (kind: ModelKind, source: ModelsOption | undefined): void => {
    if (source === undefined) {
      warnIfEmpty(kind)
      return
    }
    if (typeof source !== 'function') {
      apply(kind, source)
      return
    }
    loading.add(kind)
    Promise.resolve(source())
      .then((models) => {
        if (!destroyed) apply(kind, models)
      })
      .catch((error) => {
        if (destroyed) return
        loading.delete(kind)
        warned.add(kind)
        log?.error(`Failed to load ${kind} models`, { error: String(error) })
        emit()
      })
  }

  init('llm', sources.llm)
  init('imageGeneration', sources.imageGeneration)

  return {
    getAvailability: (type) => {
      const kind = MODEL_NODE_TYPES[type as keyof typeof MODEL_NODE_TYPES]
      if (!kind) return undefined
      if (loading.has(kind))
        return { available: false, loading: true, reason: 'Loading models…' }
      if (optionsFor(type).length === 0)
        return {
          available: false,
          loading: false,
          reason: 'No models available',
        }
      return { available: true, loading: false }
    },
    setModels: (models) => {
      if (models.llm) apply('llm', models.llm)
      if (models.imageGeneration)
        apply('imageGeneration', models.imageGeneration)
    },
    onChange: (callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    destroy: () => {
      destroyed = true
    },
  }
}
