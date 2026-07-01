import { describe, expect, it } from 'vitest'
import { formatDuration, pluralize, toSnakeCase } from 'wayflow/core'

describe('toSnakeCase', () => {
  it('lowercases and joins words with underscores', () => {
    expect(toSnakeCase('Research Topic')).toBe('research_topic')
  })

  it('trims and collapses non-alphanumerics', () => {
    expect(toSnakeCase('  Hello, World!  ')).toBe('hello_world')
  })

  it('returns undefined for empty or symbol-only input', () => {
    expect(toSnakeCase(undefined)).toBeUndefined()
    expect(toSnakeCase('')).toBeUndefined()
    expect(toSnakeCase('!!!')).toBeUndefined()
  })
})

describe('formatDuration', () => {
  it('renders sub-second values in milliseconds', () => {
    expect(formatDuration(500)).toBe('500 ms')
  })

  it('renders second-scale values with one decimal', () => {
    expect(formatDuration(1500)).toBe('1.5s')
  })
})

describe('pluralize', () => {
  it('keeps the singular only for a count of one', () => {
    expect(pluralize(1, 'node')).toBe('1 node')
    expect(pluralize(0, 'node')).toBe('0 nodes')
    expect(pluralize(2, 'node')).toBe('2 nodes')
  })
})
