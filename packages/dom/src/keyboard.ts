// Decides when an editor keyboard shortcut should fire. Focus inside the editor
// always counts; an unanchored target (body/html — e.g. after blurring an input
// by clicking empty space) counts only when the most recent click or focus
// landed inside the editor, so an embedded editor doesn't claim shortcuts while
// the user is working the host page around it.

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface KeyboardScope {
  isInScope: (target: EventTarget | null) => boolean
  destroy: () => void
}

export const createKeyboardScope = (
  keyboardTarget: HTMLElement,
): KeyboardScope => {
  const contains = (target: EventTarget | null): boolean =>
    target instanceof Node && keyboardTarget.contains(target)

  // Capture phase: panels stopPropagation on pointerdown during bubbling.
  let engaged = false
  const track = (event: Event): void => {
    engaged = contains(event.target)
  }
  document.addEventListener('pointerdown', track, true)
  document.addEventListener('focusin', track, true)

  return {
    isInScope: (target) =>
      contains(target) ||
      ((target === document.body || target === document.documentElement) &&
        engaged),
    destroy: () => {
      document.removeEventListener('pointerdown', track, true)
      document.removeEventListener('focusin', track, true)
    },
  }
}
