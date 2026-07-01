// Viewport width below which modals become bottom drawers and the inspector a
// bottom overlay.
export const COMPACT_BREAKPOINT = 640

// Editor width below which the inspector docks as a right-edge overlay instead of
// a side panel — keyed on the editor, so embeds adapt regardless of viewport.
export const INSPECTOR_SIDEBAR_MIN_WIDTH = 1000

export const isCompactViewport = (): boolean =>
  window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT}px)`).matches
