// A push-driven stream: producers call push()/close() from anywhere — including
// synchronous callbacks deep inside a handler — and a single consumer reads it
// with for-await. Pushes that arrive while no one is waiting are buffered and
// drained in order, bridging push-based emission to pull-based iteration.

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface AsyncQueue<T> extends AsyncIterable<T> {
  push: (item: T) => void
  close: () => void
}

export const createAsyncQueue = <T>(): AsyncQueue<T> => {
  const items: T[] = []
  let closed = false
  let waiter: (() => void) | undefined

  const wake = (): void => {
    const resolve = waiter
    waiter = undefined
    resolve?.()
  }

  const next = async (): Promise<IteratorResult<T>> => {
    while (items.length === 0 && !closed) {
      await new Promise<void>((resolve) => {
        waiter = resolve
      })
    }
    if (items.length > 0) return { value: items.shift()!, done: false }
    return { value: undefined, done: true }
  }

  return {
    push: (item) => {
      if (closed) return
      items.push(item)
      wake()
    },
    close: () => {
      closed = true
      wake()
    },
    [Symbol.asyncIterator]: () => ({ next }),
  }
}
