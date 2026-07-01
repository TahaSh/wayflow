export const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

export const isAsyncIterable = (x: unknown): x is AsyncIterable<unknown> =>
  x != null &&
  typeof (x as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
    'function'
