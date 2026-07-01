import { describe, expect, it } from 'vitest'
import { isTruncatedValue } from 'wayflow/agent'

describe('isTruncatedValue', () => {
  it('accepts the truncation marker', () => {
    expect(isTruncatedValue({ __truncated: true, size: 9, preview: 'x' })).toBe(
      true,
    )
  })

  it('rejects plain objects and primitives', () => {
    expect(isTruncatedValue({ foo: 1 })).toBe(false)
    expect(isTruncatedValue('text')).toBe(false)
    expect(isTruncatedValue(null)).toBe(false)
  })
})
