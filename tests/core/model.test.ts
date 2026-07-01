import { describe, expect, it } from 'vitest'
import { boundsIntersect, connectionValidator } from 'wayflow/core'
import { edge, graph, node } from '../helpers'

describe('connectionValidator', () => {
  const twoNodes = () =>
    graph([
      node({ id: 'a', type: 'x', outputs: ['out'] }),
      node({ id: 'b', type: 'y', inputs: ['in'] }),
    ])

  it('accepts an output→input link between two nodes', () => {
    expect(
      connectionValidator({
        graph: twoNodes(),
        sourceNodeId: 'a',
        sourcePortId: 'out',
        targetNodeId: 'b',
        targetPortId: 'in',
      }),
    ).toBe(true)
  })

  it('rejects a self-connection', () => {
    expect(
      connectionValidator({
        graph: twoNodes(),
        sourceNodeId: 'a',
        sourcePortId: 'out',
        targetNodeId: 'a',
        targetPortId: 'out',
      }),
    ).toBe(false)
  })

  it('rejects when the source port is not an output', () => {
    const g = graph([
      node({ id: 'a', type: 'x', inputs: ['in'], outputs: ['out'] }),
      node({ id: 'b', type: 'y', inputs: ['in'] }),
    ])
    expect(
      connectionValidator({
        graph: g,
        sourceNodeId: 'a',
        sourcePortId: 'in',
        targetNodeId: 'b',
        targetPortId: 'in',
      }),
    ).toBe(false)
  })

  it('rejects a target port that is already connected', () => {
    const g = graph(
      [
        node({ id: 'a', type: 'x', outputs: ['out'] }),
        node({ id: 'a2', type: 'x', outputs: ['out'] }),
        node({ id: 'b', type: 'y', inputs: ['in'] }),
      ],
      [edge('a', 'out', 'b', 'in')],
    )
    expect(
      connectionValidator({
        graph: g,
        sourceNodeId: 'a2',
        sourcePortId: 'out',
        targetNodeId: 'b',
        targetPortId: 'in',
      }),
    ).toBe(false)
  })

  it('honors a custom validator veto', () => {
    expect(
      connectionValidator({
        graph: twoNodes(),
        sourceNodeId: 'a',
        sourcePortId: 'out',
        targetNodeId: 'b',
        targetPortId: 'in',
        customValidator: () => false,
      }),
    ).toBe(false)
  })
})

describe('boundsIntersect', () => {
  const box = { left: 0, top: 0, right: 10, bottom: 10 }

  it('detects overlap', () => {
    expect(
      boundsIntersect(box, { left: 5, top: 5, right: 15, bottom: 15 }),
    ).toBe(true)
  })

  it('rejects disjoint boxes', () => {
    expect(
      boundsIntersect(box, { left: 20, top: 20, right: 30, bottom: 30 }),
    ).toBe(false)
  })

  it('treats edge-touching boxes as non-overlapping', () => {
    expect(
      boundsIntersect(box, { left: 10, top: 0, right: 20, bottom: 10 }),
    ).toBe(false)
  })
})
