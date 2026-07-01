// A DOM subtree that patches its own leaves on update rather than being rebuilt,
// so scroll, focus, selection, and expand/collapse state survive across updates.
// Implement it wherever the backing data changes frequently.
export interface UpdatableView<T> {
  element: HTMLElement
  update: (data: T) => void
}

// Maps a keyed list onto child views: new keys are created and appended, existing
// ones updated in place, dropped keys removed — never rebuilding the whole list.
// Returns a view of the list itself, so it composes inside larger updatable views.
export const createListReconciler = <T>(
  container: HTMLElement,
  keyOf: (item: T) => string,
  create: (item: T) => UpdatableView<T>,
): UpdatableView<T[]> => {
  const views = new Map<string, UpdatableView<T>>()
  return {
    element: container,
    update: (items) => {
      const seen = new Set<string>()
      for (const item of items) {
        const key = keyOf(item)
        seen.add(key)
        let view = views.get(key)
        if (!view) {
          view = create(item)
          views.set(key, view)
          container.appendChild(view.element)
        }
        view.update(item)
      }
      for (const [key, view] of views) {
        if (seen.has(key)) continue
        view.element.remove()
        views.delete(key)
      }
    },
  }
}
