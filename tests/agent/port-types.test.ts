import { describe, expect, it } from 'vitest'
import {
  createPortTypeRegistry,
  isTypeCompatible,
  PORT_TYPES,
} from 'wayflow/agent'

describe('isTypeCompatible', () => {
  it('accepts equal types', () => {
    expect(isTypeCompatible('string', 'string')).toBe(true)
  })

  it('rejects mismatched concrete types', () => {
    expect(isTypeCompatible('string', 'number')).toBe(false)
  })

  it('treats `any` as compatible with anything', () => {
    expect(isTypeCompatible('any', 'number')).toBe(true)
    expect(isTypeCompatible('number', 'any')).toBe(true)
  })

  it('treats an unset type as compatible', () => {
    expect(isTypeCompatible(undefined, 'number')).toBe(true)
    expect(isTypeCompatible('string', undefined)).toBe(true)
  })
})

describe('createPortTypeRegistry', () => {
  it('returns a copy so mutations do not leak into the presets', () => {
    const registry = createPortTypeRegistry()
    expect(registry).not.toBe(PORT_TYPES)
    expect(registry.string).toEqual(PORT_TYPES.string)

    registry.custom = { label: 'Custom', color: '#000' }
    expect(PORT_TYPES.custom).toBeUndefined()
  })
})
