import {
  createNode,
  type DataPreview,
  type Node,
  type NodeData,
  PORT_SIDE,
  type Port,
  type Position,
  type PreviewSegment,
} from '@wayflow/core'
import { ARRAY_OP, type ArrayOpConfig, DEFAULT_ARRAY_OP } from './array-ops'
import {
  createError,
  createWarning,
  ERROR_CODE,
  type ValidationWarning,
} from './error'
import { DEFAULT_IMAGE_SIZE, resolveImageSize } from './image-sizes'
import { COMPARE_OPERATORS } from './operators'
import { getPortTypeColor, type PortTypeRegistry } from './port-types'
import type { ToolMetadata } from './tools'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export type NodeConfig = NodeData

export interface ConfigField {
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'slider'
    | 'select'
    | 'json'
    | 'boolean'
    | 'fields'
    | 'tools-select'
    | 'image-size'
    | 'array-op'
  label?: string
  default?: unknown
  options?: string[] // For 'select'
  emptyHint?: string // For 'select' — shown in place of the dropdown when options is empty
  min?: number // For 'slider' and 'number'
  max?: number // For 'slider' and 'number'
  step?: number // For 'slider'
  optional?: boolean // For 'slider' — adds an Auto/Custom toggle; Auto omits it
  enabledDefault?: number // For an optional 'slider' — the value Custom seeds
  withDefaults?: boolean // For 'fields' — if false, the row hides the default-value editor (Output)
  // For 'fields' — when true, the rows are managed by the preset (via reconcileData)
  // and the user can edit defaults but not add/remove rows or rename them.
  lockNames?: boolean
  // For 'fields' — when true, each row offers a "Multiple values" toggle that
  // makes the field hold a list (its default becomes a list of values).
  allowMultiple?: boolean
  // For 'fields' — when true, each row offers a "Required" toggle.
  allowRequired?: boolean
}

// One row in a 'fields'-typed config (Input/Output presets).
// `name` doubles as the runtime-key and the port id for that row.
// `default` is meaningful only when withDefaults: true on the field schema.
// `format` is a rendering hint (see FIELD_FORMAT), only meaningful for strings.
// `multiple` makes the field hold a list; its `default` is then a list of values.
export interface Field {
  name: string
  dataType: string
  default?: unknown
  format?: string
  multiple?: boolean
  required?: boolean // unset counts as required
}

export const isFieldRequired = (field: Field): boolean =>
  field.required !== false

export const isFieldValueEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

export interface PortDefinition {
  id: string
  dataType: string
  label?: string
}

export interface PortsShape {
  inputs: PortDefinition[]
  outputs: PortDefinition[]
}

export type PortsResolver = (data: NodeData) => PortsShape

export interface ConfigPreviewContext {
  connectedPortIds: Set<string>
}

export type ConfigPreviewFn = (
  data: Record<string, unknown>,
  ctx?: ConfigPreviewContext,
) => DataPreview

export interface NodeValidateContext {
  connectedPortIds: Set<string>
  toolCatalog: Record<string, ToolMetadata>
}

export type NodeValidateFn = (
  node: Node,
  ctx: NodeValidateContext,
) => ValidationWarning[]

export interface NodeTypeDefinition {
  label: string
  category: string
  icon?: string
  ports: PortsShape | PortsResolver
  configSchema: Record<string, ConfigField>
  configPreview?: ConfigPreviewFn | null
  // Called after each config update; returns data with derived fields synced.
  reconcileData?: (data: NodeData) => NodeData
  hideInlinePreview?: boolean
  // At most one of this type per graph (e.g. Input, Output).
  unique?: boolean
  // Whether this node can offer "Run once per item". Defaults to true for any
  // node with inputs and outputs; structural/flow nodes set it false.
  mappable?: boolean
  // Static pre-run checks specific to this node type (e.g. unfilled inputs).
  validate?: NodeValidateFn
}

// Returns the resolved ports shape for a definition, given the node's current data.
// Static `ports` is returned as-is; a function form is invoked with the data.
export const resolvePorts = (
  definition: NodeTypeDefinition,
  data: NodeData,
): PortsShape => {
  return typeof definition.ports === 'function'
    ? definition.ports(data)
    : definition.ports
}

export const hasDynamicPorts = (definition: NodeTypeDefinition): boolean => {
  return typeof definition.ports === 'function'
}

// A node can run once per item when it isn't opted out and has something to
// iterate (an input) and somewhere to collect (an output).
export const isMappable = (
  definition: NodeTypeDefinition,
  data: NodeData,
): boolean => {
  if (definition.mappable === false) return false
  const { inputs, outputs } = resolvePorts(definition, data)
  return inputs.length >= 1 && outputs.length >= 1
}

// Pulls `{varName}` tokens from a template, deduplicated, in encounter order.
export const parseTemplateVars = (text: string): string[] => {
  const re = /\{(\w+)\}/g
  const seen = new Set<string>()
  const result: string[] = []
  let m = re.exec(text)
  while (m !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      result.push(m[1])
    }
    m = re.exec(text)
  }
  return result
}

const templateVarInputs = (text: string, data: NodeData): PortDefinition[] => {
  const defaults = (data.variableDefaults as Field[] | undefined) ?? []
  const typeByName = new Map(defaults.map((f) => [f.name, f.dataType]))
  return parseTemplateVars(text).map((name) => ({
    id: name,
    dataType: typeByName.get(name) ?? 'string',
    label: name,
  }))
}

const reconcileVariableDefaults = (data: NodeData, text: string): NodeData => {
  const existing = (data.variableDefaults as Field[] | undefined) ?? []
  const byName = new Map(existing.map((f) => [f.name, f]))
  const next = parseTemplateVars(text).map(
    (name) => byName.get(name) ?? { name, dataType: 'string', default: '' },
  )
  const sameOrder =
    next.length === existing.length &&
    next.every((f, i) => f.name === existing[i].name)
  // Same reference when aligned so callers don't churn undo history.
  return sameOrder ? data : { ...data, variableDefaults: next }
}

const unsetVarWarnings = (
  node: Node,
  text: string,
  ctx: NodeValidateContext,
): ValidationWarning[] => {
  const defaults = (node.data.variableDefaults as Field[] | undefined) ?? []
  const defaultByName = new Map(defaults.map((f) => [f.name, f.default]))
  const warnings: ValidationWarning[] = []
  for (const name of parseTemplateVars(text)) {
    if (ctx.connectedPortIds.has(name)) continue
    if (isFieldValueEmpty(defaultByName.get(name))) {
      warnings.push(
        createWarning(ERROR_CODE.VALIDATION_VAR_UNSET, { name }, [node.id]),
      )
    }
  }
  return warnings
}

// Flags `{image 1}`-style tokens: an identifier broken by spaces, almost always
// a mistyped variable. The space requirement keeps JSON/code (`{"k": 1}`) out.
const invalidVarWarnings = (node: Node, text: string): ValidationWarning[] => {
  const warnings: ValidationWarning[] = []
  for (const match of text.matchAll(/\{\s*\w+(?:\s+\w+)+\s*\}/g)) {
    const name = match[0].slice(1, -1).trim()
    warnings.push(
      createWarning(ERROR_CODE.VALIDATION_VAR_INVALID_NAME, { name }, [
        node.id,
      ]),
    )
  }
  return warnings
}

export type NodeTypeRegistry = Record<string, NodeTypeDefinition>

interface CreateTypedNodeParams {
  type: string
  registry: NodeTypeRegistry
  portTypes: PortTypeRegistry
  position: Position
  data?: NodeData
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Built-in Presets
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const BUILTIN_NODE_TYPES: NodeTypeRegistry = {
  input: {
    label: 'Input',
    category: 'Flow',
    icon: 'input',
    unique: true,
    mappable: false,
    ports: (data) => ({
      inputs: [],
      outputs: ((data.fields as Field[] | undefined) ?? []).map((f) => ({
        id: f.name,
        dataType: f.dataType,
        label: f.name,
      })),
    }),
    configSchema: {
      fields: {
        type: 'fields',
        label: 'Fields',
        withDefaults: true,
        allowMultiple: true,
        allowRequired: true,
        default: [{ name: 'input', dataType: 'string', default: '' }],
      },
    },
    // Field names already render as port labels on the node — suppress the
    // redundant data-preview area inside the body.
    configPreview: null,
    // Emitted value is just the user-authored Variable Default — already visible
    // in the config panel, so showing it again post-run is noise.
    hideInlinePreview: true,
  },

  output: {
    label: 'Output',
    category: 'Flow',
    icon: 'output',
    unique: true,
    mappable: false,
    ports: (data) => ({
      inputs: ((data.fields as Field[] | undefined) ?? []).map((f) => ({
        id: f.name,
        dataType: f.dataType,
        label: f.name,
      })),
      outputs: [],
    }),
    configSchema: {
      fields: {
        type: 'fields',
        label: 'Fields',
        withDefaults: false,
        default: [{ name: 'result', dataType: 'string' }],
      },
    },
    configPreview: null,
  },

  llm: {
    label: 'LLM',
    category: 'AI',
    icon: 'sparkles',
    ports: (data) => {
      const prompt = String(data.prompt ?? '')
      const systemPrompt = String(data.systemPrompt ?? '')
      const outputSchema = (data.outputSchema as Field[] | undefined) ?? []
      return {
        inputs: templateVarInputs(`${prompt}\n${systemPrompt}`, data),
        outputs: outputSchema.map((f) => ({
          id: f.name,
          dataType: f.dataType,
          label: f.name,
        })),
      }
    },
    configSchema: {
      model: {
        type: 'select',
        label: 'Model',
        options: [],
        emptyHint: 'No models available',
      },
      prompt: {
        type: 'textarea',
        label: 'Prompt',
        default: '',
      },
      systemPrompt: {
        type: 'textarea',
        label: 'System Prompt',
        default: '',
      },
      variableDefaults: {
        type: 'fields',
        label: 'Variable Defaults',
        withDefaults: true,
        lockNames: true,
        default: [],
      },
      outputSchema: {
        type: 'fields',
        label: 'Output Schema',
        withDefaults: false,
        default: [{ name: 'response', dataType: 'string' }],
      },
      tools: {
        type: 'tools-select',
        label: 'Tools',
        default: [],
      },
      temperature: {
        type: 'slider',
        label: 'Temperature',
        optional: true,
        enabledDefault: 1,
        min: 0,
        max: 2,
        step: 0.1,
      },
      maxTokens: {
        type: 'number',
        label: 'Max Tokens',
        default: 4096,
        min: 1,
        max: 128000,
      },
    },
    configPreview: (data): DataPreview => {
      const segments: PreviewSegment[] = [
        { text: String(data.model ?? ''), role: 'value' },
      ]
      if (typeof data.temperature === 'number') {
        segments.push(' · temp ', {
          text: String(data.temperature),
          role: 'value',
        })
      }
      const tools = (data.tools as string[] | undefined) ?? []
      for (const name of tools) {
        segments.push({ text: name, role: 'chip', icon: 'tool' })
      }
      return segments
    },
    reconcileData: (data) => {
      const prompt = String(data.prompt ?? '')
      const systemPrompt = String(data.systemPrompt ?? '')
      return reconcileVariableDefaults(data, `${prompt}\n${systemPrompt}`)
    },
    validate: (node, ctx) => {
      const prompt = String(node.data.prompt ?? '')
      const systemPrompt = String(node.data.systemPrompt ?? '')
      if (prompt.trim() === '' && systemPrompt.trim() === '') {
        return [
          createWarning(ERROR_CODE.VALIDATION_LLM_NO_PROMPT, undefined, [
            node.id,
          ]),
        ]
      }
      const text = `${prompt}\n${systemPrompt}`
      const warnings = [
        ...invalidVarWarnings(node, text),
        ...unsetVarWarnings(node, text, ctx),
      ]
      const selectedTools = (node.data.tools as string[] | undefined) ?? []
      for (const name of selectedTools) {
        if (!(name in ctx.toolCatalog)) {
          warnings.push(
            createWarning(ERROR_CODE.VALIDATION_TOOL_NOT_IN_CATALOG, { name }, [
              node.id,
            ]),
          )
        }
      }
      return warnings
    },
  },

  imageGeneration: {
    label: 'Image Generation',
    category: 'AI',
    icon: 'image',
    ports: (data) => ({
      inputs: templateVarInputs(String(data.prompt ?? ''), data),
      outputs: [{ id: 'image', dataType: 'image', label: 'Image' }],
    }),
    configSchema: {
      model: {
        type: 'select',
        label: 'Model',
        options: [],
        emptyHint: 'No models available',
      },
      prompt: {
        type: 'textarea',
        label: 'Prompt',
        default: '',
      },
      size: {
        type: 'image-size',
        label: 'Size',
        default: DEFAULT_IMAGE_SIZE,
      },
      negativePrompt: {
        type: 'textarea',
        label: 'Negative Prompt',
        default: '',
      },
      seed: {
        type: 'number',
        label: 'Seed',
        min: 0,
      },
      variableDefaults: {
        type: 'fields',
        label: 'Variable Defaults',
        withDefaults: true,
        lockNames: true,
        default: [],
      },
    },
    configPreview: (data): DataPreview => {
      const { width, height } = resolveImageSize(data.size)
      return [
        { text: String(data.model ?? ''), role: 'value' },
        ' · ',
        { text: `${width}×${height}`, role: 'value' },
      ]
    },
    reconcileData: (data) =>
      reconcileVariableDefaults(data, String(data.prompt ?? '')),
    validate: (node, ctx) => {
      const prompt = String(node.data.prompt ?? '')
      if (prompt.trim() === '') {
        return [
          createWarning(ERROR_CODE.VALIDATION_IMAGE_NO_PROMPT, undefined, [
            node.id,
          ]),
        ]
      }
      return [
        ...invalidVarWarnings(node, prompt),
        ...unsetVarWarnings(node, prompt, ctx),
      ]
    },
  },

  conditional: {
    label: 'Conditional',
    category: 'Flow',
    icon: 'conditional',
    mappable: false,
    ports: {
      inputs: [
        { id: 'value', dataType: 'any', label: 'Value' },
        { id: 'target', dataType: 'any', label: 'Target' },
      ],
      outputs: [
        { id: 'true', dataType: 'any', label: 'True' },
        { id: 'false', dataType: 'any', label: 'False' },
      ],
    },
    configSchema: {
      operator: {
        type: 'select',
        label: 'Operator',
        default: '==',
        options: [...COMPARE_OPERATORS],
      },
      valueDefault: {
        type: 'text',
        label: 'Value default',
        default: '',
      },
      targetDefault: {
        type: 'text',
        label: 'Target default',
        default: '',
      },
    },
    // Show the target alongside the operator only when the target port isn't
    // connected — otherwise the displayed default would mislead since the
    // runtime would use the upstream value instead.
    configPreview: (data, ctx): DataPreview => {
      const op = String(data.operator ?? '==')
      const target = data.targetDefault
      const targetConnected = ctx?.connectedPortIds.has('target') ?? false
      const segments: PreviewSegment[] = [{ text: op, role: 'key' }]
      if (!targetConnected && typeof target === 'string' && target.length > 0) {
        segments.push(' ', { text: target, role: 'value' })
      }
      return segments
    },
  },

  merge: {
    label: 'Merge',
    category: 'Flow',
    icon: 'merge',
    mappable: false,
    ports: (data) => ({
      inputs: ((data.fields as Field[] | undefined) ?? []).map((f) => ({
        id: f.name,
        dataType: f.dataType,
        label: f.name,
      })),
      // Output dataType tracks the mode so downstream connections stay type-checked:
      // combine returns an object, concatenate returns a string, pass-through is opaque.
      outputs: [
        {
          id: 'output',
          dataType:
            data.mode === 'combine'
              ? 'json'
              : data.mode === 'concatenate'
                ? 'string'
                : 'any',
          label: 'Output',
        },
      ],
    }),
    configSchema: {
      fields: {
        type: 'fields',
        label: 'Inputs',
        withDefaults: false,
        default: [
          { name: 'input_a', dataType: 'any' },
          { name: 'input_b', dataType: 'any' },
        ],
      },
      mode: {
        type: 'select',
        label: 'Mode',
        default: 'pass-through',
        options: ['pass-through', 'combine', 'concatenate', 'zip'],
      },
    },
    configPreview: (data) => `mode: ${data.mode ?? 'pass-through'}`,
  },

  arrayOps: {
    label: 'Array Operations',
    category: 'Flow',
    icon: 'list',
    mappable: false,
    ports: (data) => {
      const op = (data.operation as ArrayOpConfig | undefined)?.op
      const dataType =
        op === ARRAY_OP.JOIN
          ? 'string'
          : op === ARRAY_OP.COUNT || op === ARRAY_OP.SUM
            ? 'number'
            : 'any'
      return {
        inputs: [{ id: 'list', dataType: 'any', label: 'List' }],
        outputs: [{ id: 'result', dataType, label: 'Result' }],
      }
    },
    configSchema: {
      operation: {
        type: 'array-op',
        label: 'Operation',
        default: DEFAULT_ARRAY_OP,
      },
    },
    configPreview: (data) => {
      const op =
        (data.operation as ArrayOpConfig | undefined)?.op ?? ARRAY_OP.COUNT
      return [{ text: op, role: 'key' }]
    },
  },

  humanInTheLoop: {
    label: 'Human Review',
    category: 'Flow',
    icon: 'human-review',
    mappable: false,
    ports: {
      inputs: [{ id: 'input', dataType: 'any', label: 'Input' }],
      outputs: [
        { id: 'approved', dataType: 'any', label: 'Approved' },
        { id: 'rejected', dataType: 'any', label: 'Rejected' },
      ],
    },
    configSchema: {
      instructions: {
        type: 'textarea',
        label: 'Review Instructions',
        default: '',
      },
    },
  },
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Registry
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createNodeTypeRegistry = (
  initial: NodeTypeRegistry = {},
): NodeTypeRegistry => {
  return { ...initial }
}

export const registerNodeType = (
  registry: NodeTypeRegistry,
  type: string,
  definition: NodeTypeDefinition,
): void => {
  registry[type] = definition
}

export const getNodeType = (
  registry: NodeTypeRegistry,
  type: string,
): NodeTypeDefinition | undefined => {
  return registry[type]
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Typed Node Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const buildDefaultConfig = (schema: Record<string, ConfigField>): NodeData => {
  const config: NodeData = {}
  for (const [key, field] of Object.entries(schema)) {
    if (field.default !== undefined) {
      config[key] = field.default
    }
  }
  return config
}

// Materializes a PortsShape (declarative) into the flat Port[] array stored on a Node.
// Exported so the editor can recompute ports when a dynamic definition resolves to a new shape.
export const buildPorts = (
  shape: PortsShape,
  portTypes: PortTypeRegistry,
): Port[] => {
  return [
    ...shape.inputs.map(({ id, dataType, label }) => ({
      id,
      side: PORT_SIDE.INPUT,
      label,
      dataType,
      color: getPortTypeColor(portTypes, dataType),
    })),
    ...shape.outputs.map(({ id, dataType, label }) => ({
      id,
      side: PORT_SIDE.OUTPUT,
      label,
      dataType,
      color: getPortTypeColor(portTypes, dataType),
    })),
  ]
}

export const createTypedNode = ({
  type,
  registry,
  portTypes,
  position,
  data,
}: CreateTypedNodeParams): Node => {
  const definition = registry[type]
  if (!definition) {
    throw createError(ERROR_CODE.AGENT_UNKNOWN_NODE_TYPE, { type })
  }

  // Caller's data is layered over schema defaults
  const merged: NodeData = {
    ...buildDefaultConfig(definition.configSchema),
    ...data,
  }
  const config = definition.reconcileData?.(merged) ?? merged

  const ports = buildPorts(resolvePorts(definition, config), portTypes)

  const resolveDataPreview = (
    definition: NodeTypeDefinition,
    data: Record<string, unknown>,
  ): DataPreview | undefined => {
    if (definition.configPreview === null) return null
    if (typeof definition.configPreview === 'function')
      return definition.configPreview(data)
    return undefined
  }

  return createNode({
    position,
    type,
    label: definition.label,
    icon: definition.icon,
    data: config,
    dataPreview: resolveDataPreview(definition, config),
    ports,
  })
}
