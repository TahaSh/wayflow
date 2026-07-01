import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { serialize } from 'wayflow/core'
import { createRuntime } from 'wayflow/runtime'
import { resume, run } from 'wayflow/runtime/client'
import { streamResponse } from 'wayflow/runtime/sse'
import { edge, graph, node } from '../helpers'

// A graph that runs straight to completion (input default → output).
const g = graph(
  [
    node({
      id: 'in',
      type: 'input',
      data: { fields: [{ name: 'x', dataType: 'string', default: 'hi' }] },
      outputs: ['x'],
    }),
    node({ id: 'out', type: 'output', inputs: ['x'] }),
  ],
  [edge('in', 'x', 'out', 'x')],
)
const runtime = createRuntime()

// The driver interfaces the client touches are tiny; no-op them.
const editor = {
  setNodeStatus: () => {},
  setEdgeStatus: () => {},
  setNodeRunData: () => {},
  clearExecutionState: () => {},
  export: () => serialize(g),
}

// Capture each outgoing request; answer with a real completed SSE stream so the
// client's consume loop resolves.
let calls: { url: string; init: RequestInit }[] = []

beforeAll(() => {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(streamResponse(runtime.stream(g, {})))
  })
})

afterEach(() => {
  calls = []
})

const headersOf = (i: number) => new Headers(calls[i].init.headers)

describe('client request init', () => {
  it('merges caller headers over the JSON content-type default', async () => {
    await run({
      url: '/api/run',
      editor,
      graph: serialize(g),
      init: { headers: { Authorization: 'Bearer abc' } },
    })
    expect(headersOf(0).get('Authorization')).toBe('Bearer abc')
    expect(headersOf(0).get('Content-Type')).toBe('application/json')
  })

  it('resolves an init function fresh for every request', async () => {
    let n = 0
    const init = () => ({ headers: { Authorization: `t${++n}` } })
    await run({ url: '/api/run', editor, graph: serialize(g), init })
    await run({ url: '/api/run', editor, graph: serialize(g), init })
    expect(headersOf(0).get('Authorization')).toBe('t1')
    expect(headersOf(1).get('Authorization')).toBe('t2')
  })

  it('passes the endpoint kind to the init function', async () => {
    const kinds: string[] = []
    const init = ({ kind }: { kind: string }) => {
      kinds.push(kind)
      return {}
    }
    await run({ url: '/api/run', editor, graph: serialize(g), init })
    await resume({
      url: '/api/resume',
      runId: 'r1',
      decision: { branch: 'approved' },
      editor,
      init,
    })
    expect(kinds).toEqual(['run', 'resume'])
  })

  it('passes other RequestInit fields through (credentials)', async () => {
    await run({
      url: '/api/run',
      editor,
      graph: serialize(g),
      init: { credentials: 'include' },
    })
    expect(calls[0].init.credentials).toBe('include')
  })
})
