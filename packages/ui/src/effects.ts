// Briefly highlights an element to pull the user's eye there (e.g. after an
// action sends them to another part of the editor). Restart-safe: repeated calls
// re-fire the animation rather than no-op.
export const flashAttention = (element: HTMLElement): void => {
  element.classList.remove('wf-attention')
  // Force reflow so re-adding the class restarts the animation.
  void element.offsetWidth
  element.classList.add('wf-attention')
  element.addEventListener(
    'animationend',
    () => element.classList.remove('wf-attention'),
    { once: true },
  )
}
