import { describe, expect, it } from 'vitest'
import {
  DEFAULTS,
  screenToCanvas,
  type Viewport,
  zoomAtPoint,
} from 'wayflow/core'

const viewport: Viewport = { x: 100, y: 50, zoom: 2 }

describe('screenToCanvas', () => {
  it('maps a screen point into canvas space', () => {
    expect(screenToCanvas(300, 200, viewport)).toEqual({ x: 100, y: 75 })
  })
})

describe('zoomAtPoint', () => {
  it('keeps the canvas point under the cursor fixed', () => {
    const before = screenToCanvas(300, 200, viewport)
    const zoomed = zoomAtPoint({
      viewport,
      screenX: 300,
      screenY: 200,
      delta: -100,
    })
    const after = screenToCanvas(300, 200, zoomed)

    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom to the configured bounds', () => {
    const zoomedIn = zoomAtPoint({
      viewport: { x: 0, y: 0, zoom: 3 },
      screenX: 0,
      screenY: 0,
      delta: -1e6,
    })
    expect(zoomedIn.zoom).toBe(DEFAULTS.maxZoom)

    const zoomedOut = zoomAtPoint({
      viewport: { x: 0, y: 0, zoom: 0.2 },
      screenX: 0,
      screenY: 0,
      delta: 1e6,
    })
    expect(zoomedOut.zoom).toBe(DEFAULTS.minZoom)
  })
})
