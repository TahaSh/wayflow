// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface PortTypeDefinition {
  label: string
  color: string
}

// Data types and their definitions
export type PortTypeRegistry = Record<string, PortTypeDefinition>

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Presets
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Hex fallback keeps standalone @wayflow/dom (without ui styles) rendering.
export const PORT_TYPES: PortTypeRegistry = {
  string: { label: 'Text', color: 'var(--wf-port-string, #f472b6)' },
  number: { label: 'Number', color: 'var(--wf-port-number, #60a5fa)' },
  boolean: { label: 'Boolean', color: 'var(--wf-port-boolean, #fbbf24)' },
  json: { label: 'JSON', color: 'var(--wf-port-json, #a78bfa)' },
  array: { label: 'Array', color: 'var(--wf-port-array, #34d399)' },
  image: { label: 'Image', color: 'var(--wf-port-image, #4ade80)' },
  any: { label: 'Any', color: 'var(--wf-port-any, #94a3b8)' },
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Registry Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createPortTypeRegistry = (
  initial: PortTypeRegistry = PORT_TYPES,
): PortTypeRegistry => {
  return { ...initial }
}

export const registerPortType = (
  registry: PortTypeRegistry,
  dataType: string,
  definition: PortTypeDefinition,
): void => {
  registry[dataType] = definition
}

export const getPortTypeColor = (
  registry: PortTypeRegistry,
  dataType: string,
): string => {
  return registry[dataType]?.color ?? registry.any?.color ?? '#94a3b8'
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Typed Connection Validation
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const isTypeCompatible = (
  sourceDataType: string | undefined,
  targetDataType: string | undefined,
): boolean => {
  if (!sourceDataType || !targetDataType) return true

  if (sourceDataType === 'any' || targetDataType === 'any') return true

  return sourceDataType === targetDataType
}
