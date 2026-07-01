import { describe, expect, it } from 'vitest'
import {
  type CheckpointRecord,
  createMemoryCheckpointStore,
  createRunSessions,
  createRuntime,
  type Handler,
  type RunOutcome,
  type Suspension,
} from 'wayflow/runtime'
import { collect, edge, expectCompleted, graph, node } from '../helpers'

const emitValue: Handler = async (n) => n.data.value

const runtime = () => createRuntime({ handlers: { value: emitValue } })

// value → human review gate → an Output on each decision branch.
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

// A session pause never carries the checkpoint — it lives server-side and the
// client resumes by runId. This narrows the outcome and asserts that contract.
const expectSessionPause = (outcome: RunOutcome): Suspension => {
  if (outcome.status !== 'paused') {
    throw new Error(`expected a paused run, got ${outcome.status}`)
  }
  expect(outcome.suspension.checkpoint).toBeUndefined()
  return outcome.suspension
}

describe('memory checkpoint store', () => {
  it('round-trips a record and deletes it', async () => {
    const store = createMemoryCheckpointStore()
    const record: CheckpointRecord = {
      graph: reviewGraph,
      suspension: {
        runId: 'r1',
        nodeId: 'gate',
        instructions: 'review',
        data: 'doc',
        checkpoint: {
          runId: 'r1',
          outputs: {},
          completed: [],
          failed: [],
          result: {},
          pending: 'gate',
          fingerprint: '',
        },
      },
    }

    await store.save('r1', record)
    expect(await store.load('r1')).toBe(record)
    expect(await store.list()).toEqual([record])

    await store.delete('r1')
    expect(await store.load('r1')).toBeUndefined()
  })
})

describe('run sessions', () => {
  it('persists the checkpoint server-side and strips it from the pause', async () => {
    const store = createMemoryCheckpointStore()
    const sessions = createRunSessions(runtime(), { store })

    const pause = expectSessionPause(await sessions.run(reviewGraph))

    expect(pause.instructions).toBe('review')
    const stored = await store.list()
    expect(stored).toHaveLength(1)
    expect(stored[0].suspension.checkpoint).toBeDefined()
  })

  it('resumes by runId to completion and drops the checkpoint', async () => {
    const sessions = createRunSessions(runtime())
    const { runId } = expectSessionPause(await sessions.run(reviewGraph))

    const outcome = await sessions.resume({
      runId,
      decision: { branch: 'approved', data: 'edited' },
    })
    if (!outcome) throw new Error('expected an outcome')

    expect(expectCompleted(outcome)).toEqual({ final: 'edited' })
    expect(await sessions.getPending(runId)).toBeNull()
  })

  it('returns null when resuming an unknown runId', async () => {
    const sessions = createRunSessions(runtime())
    const outcome = await sessions.resume({
      runId: 'nope',
      decision: { branch: 'approved' },
    })
    expect(outcome).toBeNull()
  })

  it('lists a waiting run with its run-so-far snapshot', async () => {
    const sessions = createRunSessions(runtime())
    await sessions.run(reviewGraph)

    const pending = await sessions.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].instructions).toBe('review')
    // The completed upstream node is captured so a reloaded editor can redraw it.
    const replayed = pending[0].snapshot?.nodes.map((n) => n.nodeId)
    expect(replayed).toContain('v')
  })

  it('cancel drops a waiting run without resuming', async () => {
    const sessions = createRunSessions(runtime())
    const { runId } = expectSessionPause(await sessions.run(reviewGraph))

    await sessions.cancel(runId)

    expect(await sessions.listPending()).toEqual([])
    expect(await sessions.getPending(runId)).toBeNull()
  })

  it('re-stores under the same runId so sequential gates resume in turn', async () => {
    const twoGateGraph = graph(
      [
        node({
          id: 'v',
          type: 'value',
          data: { value: 'doc' },
          outputs: ['o'],
        }),
        node({
          id: 'g1',
          type: 'humanInTheLoop',
          data: { instructions: 'first' },
          inputs: ['input'],
          outputs: ['approved', 'rejected'],
        }),
        node({
          id: 'g2',
          type: 'humanInTheLoop',
          data: { instructions: 'second' },
          inputs: ['input'],
          outputs: ['approved', 'rejected'],
        }),
        node({ id: 'out', type: 'output', inputs: ['final'] }),
      ],
      [
        edge('v', 'o', 'g1', 'input'),
        edge('g1', 'approved', 'g2', 'input'),
        edge('g2', 'approved', 'out', 'final'),
      ],
    )
    const sessions = createRunSessions(runtime())

    const first = expectSessionPause(await sessions.run(twoGateGraph))
    expect(first.instructions).toBe('first')

    const secondOutcome = await sessions.resume({
      runId: first.runId,
      decision: { branch: 'approved' },
    })
    if (!secondOutcome) throw new Error('expected an outcome')
    const second = expectSessionPause(secondOutcome)
    expect(second.runId).toBe(first.runId)
    expect(second.instructions).toBe('second')

    const doneOutcome = await sessions.resume({
      runId: first.runId,
      decision: { branch: 'approved' },
    })
    if (!doneOutcome) throw new Error('expected an outcome')
    expect(expectCompleted(doneOutcome)).toEqual({ final: 'doc' })
  })

  it('streams events and strips the checkpoint from the paused event', async () => {
    const sessions = createRunSessions(runtime())
    const events = await collect(sessions.stream(reviewGraph))

    const paused = events.find(
      (e) => e.event === 'run_status' && e.data.status === 'paused',
    )
    expect(paused).toBeDefined()
    if (paused?.event === 'run_status' && paused.data.status === 'paused') {
      expect(paused.data.suspension.checkpoint).toBeUndefined()
      expect(paused.data.suspension.runId).toBeTruthy()
    }
  })
})
