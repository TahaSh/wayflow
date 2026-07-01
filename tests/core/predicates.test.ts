import { describe, expect, it } from 'vitest'
import { isAsyncIterable, isPlainObject } from 'wayflow/core'

describe('isPlainObject', () => {
  it('accepts plain objects only', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it('rejects arrays, null, and primitives', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('s')).toBe(false)
    expect(isPlainObject(5)).toBe(false)
  })
})

describe('isAsyncIterable', () => {
  it('accepts an async generator', () => {
    const gen = (async function* () {})()
    expect(isAsyncIterable(gen)).toBe(true)
  })

  it('rejects sync iterables, plain objects, and null', () => {
    expect(isAsyncIterable([])).toBe(false)
    expect(isAsyncIterable({})).toBe(false)
    expect(isAsyncIterable(null)).toBe(false)
  })
})
