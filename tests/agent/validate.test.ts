import { describe, expect, it } from 'vitest'
import {
  createWarning,
  ERROR_CODE,
  type RunDataEntry,
  validateGraph,
  validateRunResults,
} from 'wayflow/agent'
import { NODE_STATUS } from 'wayflow/core'
import { edge, graph, node, nodeTypeDef } from '../helpers'

const codesOf = (warnings: { code: string }[]) => warnings.map((w) => w.code)

describe('validateGraph', () => {
  it('returns nothing for an empty graph', () => {
    expect(validateGraph(graph([]), {})).toEqual([])
  })

  it('passes a connected input→output graph', () => {
    const g = graph(
      [
        node({ id: 'in', type: 'input', outputs: ['o'] }),
        node({ id: 'out', type: 'output', inputs: ['i'] }),
      ],
      [edge('in', 'o', 'out', 'i')],
    )
    expect(validateGraph(g, {})).toEqual([])
  })

  it('flags a missing input and output node', () => {
    const g = graph(
      [
        node({ id: 'a', type: 'llm', outputs: ['o'] }),
        node({ id: 'b', type: 'llm', inputs: ['i'] }),
      ],
      [edge('a', 'o', 'b', 'i')],
    )
    const codes = codesOf(validateGraph(g, {}))
    expect(codes).toContain(ERROR_CODE.VALIDATION_NO_INPUT_NODE)
    expect(codes).toContain(ERROR_CODE.VALIDATION_NO_OUTPUT_NODE)
  })

  it('flags a cycle', () => {
    const g = graph(
      [
        node({ id: 'in', type: 'input', inputs: ['i'], outputs: ['o'] }),
        node({ id: 'out', type: 'output', inputs: ['i'], outputs: ['o'] }),
      ],
      [edge('in', 'o', 'out', 'i'), edge('out', 'o', 'in', 'i')],
    )
    expect(codesOf(validateGraph(g, {}))).toContain(
      ERROR_CODE.RUNTIME_CYCLE_DETECTED,
    )
  })

  it('flags an orphan node in a larger graph', () => {
    const g = graph(
      [
        node({ id: 'in', type: 'input', outputs: ['o'] }),
        node({ id: 'out', type: 'output', inputs: ['i'] }),
        node({ id: 'lonely', type: 'llm' }),
      ],
      [edge('in', 'o', 'out', 'i')],
    )
    const orphan = validateGraph(g, {}).find(
      (w) => w.code === ERROR_CODE.VALIDATION_ORPHAN_NODE,
    )
    expect(orphan?.nodeIds).toEqual(['lonely'])
  })

  it('flags more than one node of a unique type', () => {
    const registry = { input: nodeTypeDef({ unique: true, label: 'Input' }) }
    const g = graph(
      [
        node({ id: 'in1', type: 'input', outputs: ['o'] }),
        node({ id: 'in2', type: 'input', outputs: ['o'] }),
        node({ id: 'out', type: 'output', inputs: ['i'] }),
      ],
      [edge('in1', 'o', 'out', 'i')],
    )
    const dup = validateGraph(g, registry).find(
      (w) => w.code === ERROR_CODE.VALIDATION_DUPLICATE_UNIQUE_NODE,
    )
    expect(dup?.nodeIds).toEqual(['in1', 'in2'])
  })

  it("runs a node type's own validate with its connected port ids", () => {
    const registry = {
      llm: nodeTypeDef({
        validate: (n, ctx) =>
          ctx.connectedPortIds.has('prompt')
            ? []
            : [
                createWarning(ERROR_CODE.VALIDATION_LLM_NO_PROMPT, undefined, [
                  n.id,
                ]),
              ],
      }),
    }
    const build = (connectPrompt: boolean) =>
      graph(
        [
          node({ id: 'in', type: 'input', outputs: ['o'] }),
          node({ id: 'llm', type: 'llm', inputs: ['prompt'], outputs: ['o'] }),
          node({ id: 'out', type: 'output', inputs: ['i'] }),
        ],
        [
          edge('llm', 'o', 'out', 'i'),
          ...(connectPrompt ? [edge('in', 'o', 'llm', 'prompt')] : []),
        ],
      )

    expect(codesOf(validateGraph(build(false), registry))).toContain(
      ERROR_CODE.VALIDATION_LLM_NO_PROMPT,
    )
    expect(codesOf(validateGraph(build(true), registry))).not.toContain(
      ERROR_CODE.VALIDATION_LLM_NO_PROMPT,
    )
  })
})

describe('validateRunResults', () => {
  const outputGraph = graph([
    node({
      id: 'out',
      type: 'output',
      inputs: ['count'],
      data: { fields: [{ name: 'count', dataType: 'number' }] },
    }),
  ])
  const complete = (outputData: unknown): Record<string, RunDataEntry> => ({
    out: { status: NODE_STATUS.COMPLETE, outputData },
  })

  it('passes when results match the declared field types', () => {
    expect(validateRunResults(outputGraph, complete({ count: 5 }))).toEqual([])
  })

  it('flags a type mismatch', () => {
    expect(
      codesOf(validateRunResults(outputGraph, complete({ count: 'five' }))),
    ).toEqual([ERROR_CODE.VALIDATION_OUTPUT_TYPE_MISMATCH])
  })

  it('flags an unwired field that produced no value', () => {
    expect(codesOf(validateRunResults(outputGraph, complete({})))).toContain(
      ERROR_CODE.VALIDATION_OUTPUT_FIELD_MISSING,
    )
  })

  it('allows a connected field to be empty (its branch may not have fired)', () => {
    const g = graph(
      [
        node({ id: 'src', type: 'llm', outputs: ['o'] }),
        node({
          id: 'out',
          type: 'output',
          inputs: ['count'],
          data: { fields: [{ name: 'count', dataType: 'number' }] },
        }),
      ],
      [edge('src', 'o', 'out', 'count')],
    )
    expect(validateRunResults(g, complete({}))).toEqual([])
  })

  it('skips a truncated value', () => {
    const truncated = { __truncated: true, size: 1, preview: 'x' }
    expect(
      validateRunResults(outputGraph, complete({ count: truncated })),
    ).toEqual([])
  })

  it('ignores nodes that have not completed', () => {
    const running: Record<string, RunDataEntry> = {
      out: { status: NODE_STATUS.RUNNING, outputData: { count: 'wrong' } },
    }
    expect(validateRunResults(outputGraph, running)).toEqual([])
  })
})
