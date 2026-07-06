import { describe, expect, it } from 'vitest'
import {
  BUILTIN_NODE_TYPES,
  createTypedNode,
  ERROR_CODE,
  hasDynamicPorts,
  isMappable,
  PORT_TYPES,
  parseTemplateVars,
  resolvePorts,
} from 'wayflow/agent'
import { nodeTypeDef } from '../helpers'

describe('parseTemplateVars', () => {
  it('extracts variables in order, de-duplicated', () => {
    expect(parseTemplateVars('Hello {name}, meet {name} from {place}')).toEqual(
      ['name', 'place'],
    )
  })

  it('returns an empty list when there are no variables', () => {
    expect(parseTemplateVars('no variables here')).toEqual([])
  })
})

describe('resolvePorts / hasDynamicPorts', () => {
  it('returns a static ports shape as-is', () => {
    const def = nodeTypeDef({
      ports: {
        inputs: [{ id: 'i', dataType: 'string' }],
        outputs: [{ id: 'o', dataType: 'string' }],
      },
    })
    expect(hasDynamicPorts(def)).toBe(false)
    expect(resolvePorts(def, {})).toEqual(def.ports)
  })

  it('invokes a ports resolver with the node data', () => {
    const def = nodeTypeDef({
      ports: (data) => ({
        inputs: [],
        outputs: data.expose ? [{ id: 'o', dataType: 'string' }] : [],
      }),
    })
    expect(hasDynamicPorts(def)).toBe(true)
    expect(resolvePorts(def, { expose: true }).outputs).toHaveLength(1)
    expect(resolvePorts(def, {}).outputs).toHaveLength(0)
  })
})

describe('isMappable', () => {
  const withPorts = (extra = {}) =>
    nodeTypeDef({
      ports: {
        inputs: [{ id: 'i', dataType: 'string' }],
        outputs: [{ id: 'o', dataType: 'string' }],
      },
      ...extra,
    })

  it('is true when the node has an input and an output', () => {
    expect(isMappable(withPorts(), {})).toBe(true)
  })

  it('is false when opted out', () => {
    expect(isMappable(withPorts({ mappable: false }), {})).toBe(false)
  })

  it('is false without both an input and an output', () => {
    const outputOnly = nodeTypeDef({
      ports: { inputs: [], outputs: [{ id: 'o', dataType: 'string' }] },
    })
    expect(isMappable(outputOnly, {})).toBe(false)
  })
})

describe('createTypedNode', () => {
  it('throws an unknown-node-type error for a missing definition', () => {
    expect(() =>
      createTypedNode({
        type: 'nope',
        registry: {},
        portTypes: PORT_TYPES,
        position: { x: 0, y: 0 },
      }),
    ).toThrowError(
      expect.objectContaining({ code: ERROR_CODE.AGENT_UNKNOWN_NODE_TYPE }),
    )
  })

  it('leaves an optional slider (temperature) unset by default', () => {
    const node = createTypedNode({
      type: 'llm',
      registry: BUILTIN_NODE_TYPES,
      portTypes: PORT_TYPES,
      position: { x: 0, y: 0 },
    })
    expect(node.data.temperature).toBeUndefined()
  })
})
