import { createError, ERROR_CODE } from '@wayflow/agent'
import type { ImageProvider } from './image-provider'
import { resolveMaxTokensParam } from './openai-token-param'
import { CHAT_ROLE, type ChatMessage, type LLMProvider } from './provider'
import { jsonSchemaInstructions } from './schema'
import { ToolCallAccumulator } from './tool-call-accumulator'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Client Shape
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// `new OpenAI()` satisfies this structurally; no openai dependency. `create`
// stays loose because the SDK ships overloaded signatures TS can't narrow at
// the boundary; the call site casts to a precise streaming signature.

export interface OpenAIChatClient {
  baseURL?: string
  chat: {
    completions: {
      create: (...args: never[]) => unknown
    }
  }
}

interface OpenAIChatChunk {
  choices: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
}

type OpenAIStreamingCreate = (
  opts: {
    model: string
    messages: unknown[]
    tools?: unknown[]
    temperature?: number
    max_tokens?: number
    response_format?:
      | { type: 'json_object' }
      | {
          type: 'json_schema'
          json_schema: { name: string; schema: unknown; strict: boolean }
        }
    stream: true
  },
  init?: { signal?: AbortSignal },
) => Promise<AsyncIterable<OpenAIChatChunk>>

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Provider
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const STRUCTURED_OUTPUT = {
  JSON_SCHEMA: 'jsonSchema',
  JSON_OBJECT: 'jsonObject',
} as const

export type StructuredOutputMode =
  (typeof STRUCTURED_OUTPUT)[keyof typeof STRUCTURED_OUTPUT]

const mapTemperatureError = (err: unknown): unknown => {
  const message = err instanceof Error ? err.message : String(err)
  if (
    /temperature/i.test(message) &&
    /unsupported|not supported|deprecated|does not support/i.test(message)
  ) {
    return createError(ERROR_CODE.LLM_TEMPERATURE_UNSUPPORTED)
  }
  return err
}

export const createOpenAIProvider = ({
  client,
  extraBody,
  structuredOutput = STRUCTURED_OUTPUT.JSON_SCHEMA,
  acceptsImageUrls = true,
  acceptsTemperature = true,
}: {
  client: OpenAIChatClient
  // Merged into every request body. Use for provider-specific fields the
  // OpenAI types don't cover (e.g., Ollama's `reasoning_effort: 'none'`).
  extraBody?: Record<string, unknown>
  // jsonSchema enforces the shape natively; jsonObject suits backends without
  // that support — it forces valid JSON and describes the shape in the prompt.
  structuredOutput?: StructuredOutputMode
  // Set false for base64-only backends (e.g. Ollama); the library then fetches
  // remote image URLs and inlines them as base64 before sending.
  acceptsImageUrls?: boolean
  // Set false for models that reject a sampling temperature
  acceptsTemperature?: boolean
}): LLMProvider => ({
  structuredOutputWithTools: structuredOutput === STRUCTURED_OUTPUT.JSON_SCHEMA,
  acceptsImageUrls,
  invoke: async function* ({
    model,
    messages,
    tools,
    temperature,
    maxTokens,
    outputSchema,
    signal,
  }) {
    // bind preserves `this` for OpenAI's class-method `create`; calling it
    // bare loses the receiver and `this._client` becomes undefined.
    const create = (
      client.chat.completions.create as OpenAIStreamingCreate
    ).bind(client.chat.completions)

    // jsonObject backends can't enforce the schema, so describe it in the
    // prompt; jsonSchema backends enforce it and leave the messages untouched.
    const finalMessages: ChatMessage[] =
      outputSchema && structuredOutput === STRUCTURED_OUTPUT.JSON_OBJECT
        ? [
            {
              role: CHAT_ROLE.SYSTEM,
              content: jsonSchemaInstructions(outputSchema),
            },
            ...messages,
          ]
        : messages

    const request: Parameters<OpenAIStreamingCreate>[0] = {
      ...extraBody,
      model,
      [resolveMaxTokensParam(client.baseURL)]: maxTokens,
      messages: finalMessages.map(toOpenAIMessage),
      tools:
        tools.length > 0
          ? tools.map((t) => ({ type: 'function', function: t }))
          : undefined,
      temperature: acceptsTemperature ? temperature : undefined,
      response_format: outputSchema
        ? structuredOutput === STRUCTURED_OUTPUT.JSON_SCHEMA
          ? {
              type: 'json_schema',
              json_schema: {
                name: 'output',
                schema: outputSchema,
                strict: true,
              },
            }
          : { type: 'json_object' }
        : undefined,
      stream: true,
    }

    let stream: Awaited<ReturnType<typeof create>>
    try {
      stream = await create(request, { signal })
    } catch (err) {
      throw mapTemperatureError(err)
    }

    const accumulator = new ToolCallAccumulator()
    let finishReason: string | null | undefined
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const delta = choice?.delta
      if (delta?.content) yield { type: 'content', delta: delta.content }
      for (const tc of delta?.tool_calls ?? []) {
        accumulator.delta(tc.index, {
          id: tc.id,
          name: tc.function?.name,
          args: tc.function?.arguments,
        })
      }
    }
    for (const call of accumulator.finalize()) {
      yield { type: 'tool_call', ...call }
    }
    // A truncated structured reply is broken JSON; fail with the real cause.
    if (outputSchema && finishReason === 'length') {
      throw createError(ERROR_CODE.LLM_OUTPUT_TRUNCATED)
    }
  },
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Message Translation
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const toOpenAIMessage = (m: ChatMessage): unknown => {
  if (m.role === CHAT_ROLE.TOOL) {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  }
  if (m.role === CHAT_ROLE.ASSISTANT && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: contentToOpenAI(m.content),
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    }
  }
  return { role: m.role, content: contentToOpenAI(m.content) }
}

const contentToOpenAI = (
  content: ChatMessage['content'],
): string | unknown[] => {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text }
    if (part.type === 'image_url') {
      return { type: 'image_url', image_url: { url: part.url } }
    }
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mediaType};base64,${part.data}` },
    }
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Image Provider
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface OpenAIImageClient {
  images: {
    generate: (...args: never[]) => unknown
  }
}

interface OpenAIImageResponse {
  data?: { b64_json?: string; url?: string }[]
}

type OpenAIImageGenerate = (
  body: {
    model: string
    prompt: string
    size?: string
    n?: number
    [key: string]: unknown
  },
  init?: { signal?: AbortSignal },
) => Promise<unknown>

// Some OpenAI-compatible backends send a non-JSON content-type, so the SDK
// returns the body as a raw string instead of a parsed object — accept both.
const parseImageResponse = (response: unknown): OpenAIImageResponse => {
  if (typeof response !== 'string')
    return (response ?? {}) as OpenAIImageResponse
  try {
    return JSON.parse(response) as OpenAIImageResponse
  } catch {
    return {}
  }
}

export const createOpenAIImageProvider = ({
  client,
  extraBody,
}: {
  client: OpenAIImageClient
  extraBody?: Record<string, unknown>
}): ImageProvider => ({
  generate: async ({ model, prompt, size, negativePrompt, seed, signal }) => {
    const generate = (client.images.generate as OpenAIImageGenerate).bind(
      client.images,
    )

    let response: Awaited<ReturnType<typeof generate>>
    try {
      response = await generate(
        {
          ...extraBody,
          model,
          prompt,
          size: size ? `${size.width}x${size.height}` : undefined,
          // Diffusion-only fields, sent only when set so backends that reject
          // unknown params aren't affected by the defaults.
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
          ...(seed !== undefined ? { seed } : {}),
          n: 1,
        },
        { signal },
      )
    } catch (err) {
      throw createError(
        ERROR_CODE.IMAGE_GENERATION_FAILED,
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      )
    }

    // A backend returns either inline base64 or a remote URL; take whichever.
    const item = parseImageResponse(response).data?.[0]
    const ref = item?.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item?.url
    if (!ref) throw createError(ERROR_CODE.IMAGE_NO_OUTPUT)
    return { images: [ref] }
  },
})
