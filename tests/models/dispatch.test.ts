import { describe, expect, it } from 'vitest'
import { isAsyncIterable } from 'wayflow/core'
import { createLLMHandler, createMockProvider } from 'wayflow/models'
import type { Handler, HandlerContext } from 'wayflow/runtime'
import { node } from '../helpers'

// Drains a handler's output (streaming or single value) into one string.
const collect = async (output: ReturnType<Handler>): Promise<string> => {
  if (!isAsyncIterable(output)) return String(await output)
  let text = ''
  for await (const chunk of output) text += String(chunk)
  return text
}

// The routed output of a structured node is the generator's return value, not a
// streamed chunk — drain to the end and take it.
const routed = async (output: ReturnType<Handler>): Promise<unknown> => {
  if (!isAsyncIterable(output)) return output
  const iterator = output[Symbol.asyncIterator]()
  let step = await iterator.next()
  while (!step.done) step = await iterator.next()
  return step.value
}

// A model handler that emits one fixed JSON payload as its structured result.
const emitJson = (value: unknown) =>
  async function* () {
    yield JSON.stringify(value)
  }

const structuredNode = (outputSchema: { name: string; dataType: string }[]) =>
  node({
    id: 'llm',
    type: 'llm',
    data: { model: 'm', prompt: 'Hi', outputSchema },
  })

// A no-op context: the dispatch paths under test only read node data and stream
// the model handler's output; they never reach into the runtime.
const ctx: HandlerContext = {
  signal: new AbortController().signal,
  emit: () => {},
  inputs: {},
  collectAsResult: () => {},
  reportInputs: () => {},
  tools: {},
  runGraph: async () => ({}),
}

const llmNode = (model: string) =>
  node({ id: 'llm', type: 'llm', data: { model, prompt: 'Hi' } })

describe('createLLMHandler', () => {
  it('wraps a provider passed directly, matching every model', async () => {
    const handler = createLLMHandler(
      createMockProvider({ chunkDelayMs: 0, respond: () => 'wrapped' }),
    )
    const text = await collect(handler(llmNode('any-model'), {}, ctx))
    expect(text).toBe('wrapped')
  })

  it('wraps a provider given as a model-map value', async () => {
    const handler = createLLMHandler({
      models: {
        '*': createMockProvider({ chunkDelayMs: 0, respond: () => 'mapped' }),
      },
    })
    const text = await collect(handler(llmNode('gpt-x'), {}, ctx))
    expect(text).toBe('mapped')
  })

  it('passes a model handler through without re-wrapping', async () => {
    const handler = createLLMHandler({
      models: {
        '*': async function* () {
          yield 'handler'
        },
      },
    })
    const text = await collect(handler(llmNode('gpt-x'), {}, ctx))
    expect(text).toBe('handler')
  })

  it('routes by model pattern across mixed targets', async () => {
    const handler = createLLMHandler({
      models: {
        'gpt-*': createMockProvider({ chunkDelayMs: 0, respond: () => 'gpt' }),
        '*': createMockProvider({ chunkDelayMs: 0, respond: () => 'fallback' }),
      },
    })
    expect(await collect(handler(llmNode('gpt-4'), {}, ctx))).toBe('gpt')
    expect(await collect(handler(llmNode('claude'), {}, ctx))).toBe('fallback')
  })

  it('unwraps a single-field structured output onto its port value', async () => {
    const sections = ['Intro', 'Body', 'Conclusion']
    const handler = createLLMHandler({
      models: { '*': emitJson({ sections }) },
    })
    const node = structuredNode([{ name: 'sections', dataType: 'json' }])
    expect(await routed(handler(node, {}, ctx))).toEqual(sections)
  })

  it('keeps multi-field structured output as an object keyed by field', async () => {
    const record = { category: 'billing', urgency: 'high' }
    const handler = createLLMHandler({ models: { '*': emitJson(record) } })
    const node = structuredNode([
      { name: 'category', dataType: 'string' },
      { name: 'urgency', dataType: 'string' },
    ])
    expect(await routed(handler(node, {}, ctx))).toEqual(record)
  })
})
