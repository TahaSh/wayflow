import { createError, ERROR_CODE } from '@wayflow/agent'
import { isAsyncIterable } from '@wayflow/core'
import type { Handler } from '@wayflow/runtime'
import { type ModelHandler, resolveModelHandler } from './dispatch'
import { createImageModelHandler } from './image-handler'
import type { ImageProvider } from './image-provider'

// A model is served either by a ModelHandler or directly by an ImageProvider,
// which is wrapped into a handler automatically.
export type ImageTarget = ModelHandler | ImageProvider

export interface CreateImageGenerationHandlerOptions {
  models: Record<string, ImageTarget>
}

const toModelHandler = (target: ImageTarget): ModelHandler =>
  typeof target === 'function' ? target : createImageModelHandler(target)

export const createImageGenerationHandler = (
  config: ImageProvider | CreateImageGenerationHandlerOptions,
): Handler => {
  const models = 'models' in config ? config.models : { '*': config }
  const resolve = resolveModelHandler(
    Object.fromEntries(
      Object.entries(models).map(([pattern, target]) => [
        pattern,
        toModelHandler(target),
      ]),
    ),
  )

  return async function imageHandler(node, inputs, ctx) {
    const model = String(node.data.model ?? '')
    const fn = resolve(model)
    if (!fn) {
      throw createError(ERROR_CODE.IMAGE_MODEL_NOT_FOUND, { model })
    }
    const ret = fn(node, inputs, ctx)
    return isAsyncIterable(ret) ? await lastValue(ret) : await ret
  }
}

// Drains an async iterable, returning its last yielded value (handlers that
// stream progress); undefined if it yielded nothing.
const lastValue = async (iter: AsyncIterable<unknown>): Promise<unknown> => {
  let last: unknown
  for await (const value of iter) last = value
  return last
}
