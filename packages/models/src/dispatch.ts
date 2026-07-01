import { createError, ERROR_CODE, type Field } from '@wayflow/agent'
import { isAsyncIterable, isPlainObject, type Node } from '@wayflow/core'
import type { Handler, HandlerContext } from '@wayflow/runtime'
import { createChatHandler } from './chat-handler'
import type { LLMProvider } from './provider'
import { isStructured } from './schema'

export type ModelHandler = (
  node: Node,
  inputs: Record<string, unknown>,
  ctx: HandlerContext,
) => Promise<unknown> | AsyncIterable<unknown>

// A model is served either by a ModelHandler or directly by a provider, which
// is wrapped in the default chat handler. Pass createChatHandler explicitly only
// to tune the chat loop (maxSteps, retries).
export type ModelTarget = ModelHandler | LLMProvider

export interface CreateLLMHandlerOptions {
  models: Record<string, ModelTarget>
}

// Order: exact match, then longest matching prefix ('gpt-4*' beats 'gpt-*'),
// then '*' wildcard.
export const resolveModelHandler = (
  models: Record<string, ModelHandler>,
): ((model: string) => ModelHandler | undefined) => {
  const exact = new Map<string, ModelHandler>()
  const prefixes: { prefix: string; fn: ModelHandler }[] = []
  let wildcard: ModelHandler | undefined

  for (const [pattern, fn] of Object.entries(models)) {
    if (pattern === '*') {
      wildcard = fn
    } else if (pattern.endsWith('*')) {
      prefixes.push({ prefix: pattern.slice(0, -1), fn })
    } else {
      exact.set(pattern, fn)
    }
  }
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length)

  return (model) => {
    const direct = exact.get(model)
    if (direct) return direct
    for (const { prefix, fn } of prefixes) {
      if (model.startsWith(prefix)) return fn
    }
    return wildcard
  }
}

const toModelHandler = (target: ModelTarget): ModelHandler =>
  typeof target === 'function' ? target : createChatHandler(target)

export const createLLMHandler = (
  config: LLMProvider | CreateLLMHandlerOptions,
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

  return async function* llmHandler(node, inputs, ctx) {
    const model = String(node.data.model ?? '')
    const fn = resolve(model)
    if (!fn) {
      throw createError(ERROR_CODE.LLM_MODEL_NOT_FOUND, { model })
    }

    const outputSchema = (node.data.outputSchema as Field[] | undefined) ?? []
    const structured = isStructured(outputSchema)
    const ret = fn(node, inputs, ctx)

    if (isAsyncIterable(ret)) {
      if (structured) {
        let text = ''
        for await (const chunk of ret) text += String(chunk)
        return shapeOutput(text, outputSchema)
      }
      yield* ret
      return
    }

    const value = await ret
    if (!structured) {
      yield value
      return
    }
    return shapeOutput(value, outputSchema)
  }
}

// Structured-mode result: the handler may have returned the parsed object
// (escape hatch) or a JSON string we parse + validate.
const shapeOutput = (value: unknown, outputSchema: Field[]): unknown => {
  const record =
    typeof value === 'string'
      ? parseAndValidate(value, outputSchema)
      : isPlainObject(value)
        ? value
        : undefined
  if (record === undefined) {
    throw createError(ERROR_CODE.LLM_OUTPUT_WRONG_TYPE, { type: typeof value })
  }
  // A port is named after its field, so a single-field schema yields that
  // field's value, not a redundant { field: value } wrapper.
  return outputSchema.length === 1 ? record[outputSchema[0].name] : record
}

const parseAndValidate = (
  text: string,
  outputSchema: Field[],
): Record<string, unknown> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw createError(
      ERROR_CODE.LLM_OUTPUT_INVALID_JSON,
      undefined,
      err instanceof Error ? err : new Error(String(err)),
    )
  }
  if (!isPlainObject(parsed)) {
    throw createError(ERROR_CODE.LLM_OUTPUT_NOT_OBJECT)
  }
  for (const f of outputSchema) {
    if (!(f.name in parsed)) {
      throw createError(ERROR_CODE.LLM_OUTPUT_MISSING_FIELD, {
        field: f.name,
        expectedKeys: outputSchema.map((s) => s.name).join(', '),
      })
    }
  }
  return parsed
}
