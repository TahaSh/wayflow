import { describe, expect, it } from 'vitest'
import {
  ARRAY_OP,
  COMPARE_OPERATOR,
  ERROR_CODE,
  SORT_DIRECTION,
} from 'wayflow/agent'
import { NODE_STATUS } from 'wayflow/core'
import { createRuntime, type Handler, type RuntimeEvent } from 'wayflow/runtime'
import {
  collect,
  edge,
  expectCompleted,
  expectPaused,
  graph,
  node,
} from '../helpers'

// A handler that emits whatever literal a node carries in `data.value` — stands
// in for any upstream node (a Constant, an LLM) without pulling in real models.
const emitValue: Handler = async (n) => n.data.value

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Built-in structural handlers
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('input / output', () => {
  it('emits a single field default and shapes it into the result', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: {
            fields: [{ name: 'message', dataType: 'string', default: 'hi' }],
          },
          outputs: ['message'],
        }),
        node({ id: 'out', type: 'output', inputs: ['message'] }),
      ],
      [edge('in', 'message', 'out', 'message')],
    )

    const result = expectCompleted(await rt.run(g))

    expect(result).toEqual({ message: 'hi' })
  })

  it('lets caller-supplied inputs override the field default', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: {
            fields: [{ name: 'message', dataType: 'string', default: 'hi' }],
          },
          outputs: ['message'],
        }),
        node({ id: 'out', type: 'output', inputs: ['message'] }),
      ],
      [edge('in', 'message', 'out', 'message')],
    )

    const result = expectCompleted(
      await rt.run(g, { inputs: { message: 'override' } }),
    )

    expect(result).toEqual({ message: 'override' })
  })

  it('routes each field of a multi-field Input to its own port', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: {
            fields: [
              { name: 'a', dataType: 'string', default: '1' },
              { name: 'b', dataType: 'string', default: '2' },
            ],
          },
          outputs: ['a', 'b'],
        }),
        node({ id: 'out', type: 'output', inputs: ['a', 'b'] }),
      ],
      [edge('in', 'a', 'out', 'a'), edge('in', 'b', 'out', 'b')],
    )

    const result = expectCompleted(await rt.run(g))

    expect(result).toEqual({ a: '1', b: '2' })
  })

  it('rejects when a required input has no value or default', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: { fields: [{ name: 'topic', dataType: 'string' }] },
          outputs: ['topic'],
        }),
        node({ id: 'out', type: 'output', inputs: ['topic'] }),
      ],
      [edge('in', 'topic', 'out', 'topic')],
    )

    await expect(rt.run(g)).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_MISSING_INPUT,
    })
  })

  it('runs a required input when a value is supplied', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: { fields: [{ name: 'topic', dataType: 'string' }] },
          outputs: ['topic'],
        }),
        node({ id: 'out', type: 'output', inputs: ['topic'] }),
      ],
      [edge('in', 'topic', 'out', 'topic')],
    )

    const result = expectCompleted(
      await rt.run(g, { inputs: { topic: 'cats' } }),
    )

    expect(result).toEqual({ topic: 'cats' })
  })

  it('runs an optional input left empty', async () => {
    const rt = createRuntime()
    const g = graph(
      [
        node({
          id: 'in',
          type: 'input',
          data: {
            fields: [{ name: 'topic', dataType: 'string', required: false }],
          },
          outputs: ['topic'],
        }),
        node({ id: 'out', type: 'output', inputs: ['topic'] }),
      ],
      [edge('in', 'topic', 'out', 'topic')],
    )

    const result = expectCompleted(await rt.run(g))

    expect(result).toEqual({ topic: '' })
  })
})

describe('merge', () => {
  const twoSources = (mode: string) =>
    graph(
      [
        node({
          id: 'a',
          type: 'value',
          data: { value: [1, 2] },
          outputs: ['o'],
        }),
        node({
          id: 'b',
          type: 'value',
          data: { value: ['x', 'y'] },
          outputs: ['o'],
        }),
        node({
          id: 'm',
          type: 'merge',
          data: { mode },
          inputs: ['a', 'b'],
          outputs: ['out'],
        }),
        node({ id: 'out', type: 'output', inputs: ['merged'] }),
      ],
      [
        edge('a', 'o', 'm', 'a'),
        edge('b', 'o', 'm', 'b'),
        edge('m', 'out', 'out', 'merged'),
      ],
    )

  const run = async (mode: string) =>
    expectCompleted(
      await createRuntime({ handlers: { value: emitValue } }).run(
        twoSources(mode),
      ),
    )

  it('zips list inputs into rows keyed by port id', async () => {
    const result = await run('zip')
    expect(result.merged).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ])
  })

  it('combines inputs into one object keyed by port id', async () => {
    const result = await run('combine')
    expect(result.merged).toEqual({ a: [1, 2], b: ['x', 'y'] })
  })

  it('passes through the first arriving input by default', async () => {
    const result = await run('pass-through')
    expect(result.merged).toEqual([1, 2])
  })
})

describe('conditional', () => {
  // value (5) → conditional (> 3) → one Output on each branch. The taken branch
  // emits the value and writes the result; the other cascades to skipped.
  const branchingGraph = graph(
    [
      node({ id: 'v', type: 'value', data: { value: 5 }, outputs: ['o'] }),
      node({
        id: 'c',
        type: 'conditional',
        data: { operator: COMPARE_OPERATOR.GT, targetDefault: '3' },
        inputs: ['value'],
        outputs: ['true', 'false'],
      }),
      node({ id: 'yes', type: 'output', inputs: ['picked'] }),
      node({ id: 'no', type: 'output', inputs: ['picked'] }),
    ],
    [
      edge('v', 'o', 'c', 'value'),
      edge('c', 'true', 'yes', 'picked'),
      edge('c', 'false', 'no', 'picked'),
    ],
  )

  it('routes to the matching branch and writes its result', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const result = expectCompleted(await rt.run(branchingGraph))
    expect(result.picked).toBe(5)
  })

  it('skips the node on the branch that was not taken', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const events = await collect(rt.stream(branchingGraph))
    const skipped = events.filter(
      (e): e is Extract<RuntimeEvent, { event: 'node_status' }> =>
        e.event === 'node_status' && e.data.status === NODE_STATUS.SKIPPED,
    )
    expect(skipped.map((e) => e.data.nodeId)).toEqual(['no'])
  })
})

describe('array operations', () => {
  const arrayOpGraph = (operation: Record<string, unknown>) =>
    graph(
      [
        node({
          id: 'v',
          type: 'value',
          data: { value: [3, 1, 2] },
          outputs: ['o'],
        }),
        node({
          id: 'op',
          type: 'arrayOps',
          data: { operation },
          inputs: ['list'],
          outputs: ['out'],
        }),
        node({ id: 'out', type: 'output', inputs: ['result'] }),
      ],
      [edge('v', 'o', 'op', 'list'), edge('op', 'out', 'out', 'result')],
    )

  const run = async (operation: Record<string, unknown>) =>
    expectCompleted(
      await createRuntime({ handlers: { value: emitValue } }).run(
        arrayOpGraph(operation),
      ),
    )

  it('counts items', async () => {
    const result = await run({ op: ARRAY_OP.COUNT })
    expect(result.result).toBe(3)
  })

  it('sorts ascending', async () => {
    const result = await run({
      op: ARRAY_OP.SORT,
      direction: SORT_DIRECTION.ASC,
    })
    expect(result.result).toEqual([1, 2, 3])
  })

  it('sums items', async () => {
    const result = await run({ op: ARRAY_OP.SUM })
    expect(result.result).toBe(6)
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Routing
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('output routing', () => {
  it('errors when a multi-port node returns a non-object', async () => {
    const rt = createRuntime({
      handlers: { bad: async () => 'not-an-object' },
    })
    const g = graph([node({ id: 'n', type: 'bad', outputs: ['a', 'b'] })])

    await expect(rt.run(g)).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_MULTI_PORT_MISMATCH,
    })
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Per-item map
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('run once per item', () => {
  it('invokes the handler per list element and collects an array', async () => {
    const rt = createRuntime({
      handlers: {
        value: emitValue,
        double: async (_n, inputs) => Number(inputs.n) * 2,
      },
    })
    const g = graph(
      [
        node({
          id: 'v',
          type: 'value',
          data: { value: [1, 2, 3] },
          outputs: ['o'],
        }),
        node({
          id: 'd',
          type: 'double',
          data: { runPerItem: true },
          inputs: ['n'],
          outputs: ['out'],
        }),
        node({ id: 'out', type: 'output', inputs: ['results'] }),
      ],
      [edge('v', 'o', 'd', 'n'), edge('d', 'out', 'out', 'results')],
    )

    const result = expectCompleted(await rt.run(g))

    expect(result.results).toEqual([2, 4, 6])
  })

  it('rejects more than one list input', async () => {
    const rt = createRuntime({
      handlers: { value: emitValue, join: async () => '' },
    })
    const g = graph(
      [
        node({
          id: 'a',
          type: 'value',
          data: { value: [1, 2] },
          outputs: ['o'],
        }),
        node({
          id: 'b',
          type: 'value',
          data: { value: [3, 4] },
          outputs: ['o'],
        }),
        node({
          id: 'j',
          type: 'join',
          data: { runPerItem: true },
          inputs: ['a', 'b'],
          outputs: ['out'],
        }),
      ],
      [edge('a', 'o', 'j', 'a'), edge('b', 'o', 'j', 'b')],
    )

    await expect(rt.run(g)).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_MAP_MULTIPLE_LISTS,
    })
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Streaming handlers
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('streaming handler', () => {
  it('emits a node_chunk per yield and concatenates the output', async () => {
    const stream: Handler = async function* () {
      yield 'a'
      yield 'b'
      yield 'c'
    }
    const rt = createRuntime({ handlers: { stream } })
    const g = graph([node({ id: 'n', type: 'stream', outputs: ['o'] })])

    const events = await collect(rt.stream(g))
    const chunks = events.filter(
      (e): e is Extract<RuntimeEvent, { event: 'node_chunk' }> =>
        e.event === 'node_chunk',
    )

    expect(chunks.map((c) => c.data.delta)).toEqual(['a', 'b', 'c'])
    expect(chunks.at(-1)?.data.content).toBe('abc')
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Suspend / resume
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('human-in-the-loop pause', () => {
  // value → humanInTheLoop gate → one Output on each decision branch.
  const reviewGraph = graph(
    [
      node({ id: 'v', type: 'value', data: { value: 'doc' }, outputs: ['o'] }),
      node({
        id: 'gate',
        type: 'humanInTheLoop',
        data: { instructions: 'review' },
        inputs: ['input'],
        outputs: ['approved', 'rejected'],
      }),
      node({ id: 'ok', type: 'output', inputs: ['final'] }),
      node({ id: 'nope', type: 'output', inputs: ['final'] }),
    ],
    [
      edge('v', 'o', 'gate', 'input'),
      edge('gate', 'approved', 'ok', 'final'),
      edge('gate', 'rejected', 'nope', 'final'),
    ],
  )

  it('pauses with the reviewed data and instructions', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const suspension = expectPaused(await rt.run(reviewGraph))

    expect(suspension.instructions).toBe('review')
    expect(suspension.data).toBe('doc')
  })

  it('resumes the approved branch with the edited value', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const { checkpoint } = expectPaused(await rt.run(reviewGraph))

    const result = expectCompleted(
      await rt.resume(reviewGraph, {
        checkpoint,
        decision: { branch: 'approved', data: 'edited' },
      }),
    )

    expect(result).toEqual({ final: 'edited' })
  })

  it('falls back to the reviewed data when the decision omits a value', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const { checkpoint } = expectPaused(await rt.run(reviewGraph))

    const result = expectCompleted(
      await rt.resume(reviewGraph, {
        checkpoint,
        decision: { branch: 'rejected' },
      }),
    )

    expect(result).toEqual({ final: 'doc' })
  })

  it('keeps the same runId across the pause and resume', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const { runId, checkpoint } = expectPaused(await rt.run(reviewGraph))

    const events = await collect(
      rt.stream(reviewGraph, {
        resume: { checkpoint, decision: { branch: 'approved' } },
      }),
    )
    const running = events.find(
      (e) => e.event === 'run_status' && e.data.status === 'running',
    )

    expect(running).toMatchObject({ data: { runId } })
  })

  it('still resumes after an un-run node is reconfigured', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const { checkpoint } = expectPaused(await rt.run(reviewGraph))

    // Edit config on a node that has not run yet — structure is unchanged, so
    // the checkpoint stays valid.
    const edited = structuredClone(reviewGraph)
    edited.nodes.ok.data.note = 'tweaked'

    const result = expectCompleted(
      await rt.resume(edited, {
        checkpoint,
        decision: { branch: 'approved' },
      }),
    )

    expect(result).toEqual({ final: 'doc' })
  })

  it('rejects a checkpoint when the graph structure changed', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const { checkpoint } = expectPaused(await rt.run(reviewGraph))

    const rewired = structuredClone(reviewGraph)
    delete rewired.nodes.nope

    await expect(
      rt.resume(rewired, {
        checkpoint,
        decision: { branch: 'approved' },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.RUNTIME_CHECKPOINT_STALE })
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Errors and guards
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('run guards', () => {
  it('errors on an empty graph', async () => {
    await expect(createRuntime().run(graph([]))).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_EMPTY_GRAPH,
    })
  })

  it('errors on a cycle', async () => {
    const g = graph(
      [
        node({ id: 'a', type: 'value', inputs: ['i'], outputs: ['o'] }),
        node({ id: 'b', type: 'value', inputs: ['i'], outputs: ['o'] }),
      ],
      [edge('a', 'o', 'b', 'i'), edge('b', 'o', 'a', 'i')],
    )
    await expect(
      createRuntime({ handlers: { value: emitValue } }).run(g),
    ).rejects.toMatchObject({ code: ERROR_CODE.RUNTIME_CYCLE_DETECTED })
  })

  it('errors when a node type has no registered handler', async () => {
    const g = graph([node({ id: 'n', type: 'mystery', outputs: ['o'] })])
    await expect(createRuntime().run(g)).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_NO_HANDLER,
    })
  })

  it('wraps a plain handler throw under HANDLER_THREW', async () => {
    const rt = createRuntime({
      handlers: {
        boom: async () => {
          throw new Error('kaboom')
        },
      },
    })
    const g = graph([node({ id: 'n', type: 'boom', outputs: ['o'] })])
    await expect(rt.run(g)).rejects.toMatchObject({
      code: ERROR_CODE.RUNTIME_HANDLER_THREW,
    })
  })
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Cancellation
// –––––––––––––––––––––––––––––––––––––––––––––––––––

describe('cancellation', () => {
  it('throws an AbortError when the signal is already aborted', async () => {
    const rt = createRuntime({ handlers: { value: emitValue } })
    const g = graph([node({ id: 'n', type: 'value', outputs: ['o'] })])
    const controller = new AbortController()
    controller.abort()

    await expect(
      rt.run(g, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
