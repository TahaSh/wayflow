import { describe, expect, it } from 'vitest'
import {
  createError,
  createWarning,
  ERROR_CODE,
  ISSUE_SEVERITY,
  WayflowError,
} from 'wayflow/agent'

describe('createError', () => {
  it('builds a WayflowError with the code and interpolated message', () => {
    const err = createError(ERROR_CODE.RUNTIME_NO_HANDLER, { nodeType: 'foo' })

    expect(err).toBeInstanceOf(WayflowError)
    expect(err.code).toBe(ERROR_CODE.RUNTIME_NO_HANDLER)
    expect(err.message).toContain('foo')
  })

  it("exposes a cause's message to the template as `reason`", () => {
    const err = createError(
      ERROR_CODE.RUNTIME_HANDLER_THREW,
      undefined,
      new Error('boom'),
    )
    expect(err.message).toBe('boom')
    expect(err.cause).toBeInstanceOf(Error)
  })

  it('serializes to the wire payload shape', () => {
    const err = createError(ERROR_CODE.RUNTIME_EMPTY_GRAPH)
    expect(err.toJSON()).toEqual({
      code: ERROR_CODE.RUNTIME_EMPTY_GRAPH,
      message: expect.any(String),
      hint: undefined,
      docsUrl: undefined,
    })
  })
})

describe('createWarning', () => {
  it('defaults to warning severity and carries the node ids', () => {
    const warning = createWarning(
      ERROR_CODE.VALIDATION_ORPHAN_NODE,
      undefined,
      ['n1'],
    )

    expect(warning.code).toBe(ERROR_CODE.VALIDATION_ORPHAN_NODE)
    expect(warning.severity).toBe(ISSUE_SEVERITY.WARNING)
    expect(warning.nodeIds).toEqual(['n1'])
    expect(warning.message).toBeTruthy()
  })
})
