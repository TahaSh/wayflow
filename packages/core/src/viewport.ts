import { type Bounds, DEFAULTS } from './model'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

interface ZoomAtPointParams {
  viewport: Viewport
  screenX: number
  screenY: number
  delta: number
}

interface ZoomByFactorParams {
  viewport: Viewport
  screenX: number
  screenY: number
  factor: number
}

interface GetVisibleBoundsParams {
  viewport: Viewport
  containerWidth: number
  containerHeight: number
}

export const screenToCanvas = (
  screenX: number,
  screenY: number,
  viewport: Viewport,
) => {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  }
}

export const canvasToScreen = (
  canvasX: number,
  canvasY: number,
  viewport: Viewport,
) => {
  return {
    x: canvasX * viewport.zoom + viewport.x,
    y: canvasY * viewport.zoom + viewport.y,
  }
}

// Scales the zoom by `factor` while keeping the canvas point under
// (screenX, screenY) fixed. Shared by wheel zoom and pinch zoom.
export const zoomByFactor = ({
  viewport,
  screenX,
  screenY,
  factor,
}: ZoomByFactorParams): Viewport => {
  const newZoom = Math.max(
    DEFAULTS.minZoom,
    Math.min(DEFAULTS.maxZoom, viewport.zoom * factor),
  )
  const zoomRatio = newZoom / viewport.zoom
  return {
    zoom: newZoom,
    x: screenX - zoomRatio * (screenX - viewport.x),
    y: screenY - zoomRatio * (screenY - viewport.y),
  }
}

export const zoomAtPoint = ({
  viewport,
  screenX,
  screenY,
  delta,
}: ZoomAtPointParams): Viewport =>
  zoomByFactor({
    viewport,
    screenX,
    screenY,
    factor: 1 - delta * DEFAULTS.zoomSensitivity,
  })

export const getVisibleBounds = ({
  viewport,
  containerWidth,
  containerHeight,
}: GetVisibleBoundsParams): Bounds => {
  const topLeft = screenToCanvas(0, 0, viewport)
  const bottomRight = screenToCanvas(containerWidth, containerHeight, viewport)

  return {
    left: topLeft.x - DEFAULTS.nodeWidth,
    top: topLeft.y - DEFAULTS.nodeHeight,
    right: bottomRight.x + DEFAULTS.nodeWidth,
    bottom: bottomRight.y + DEFAULTS.nodeHeight,
  }
}
