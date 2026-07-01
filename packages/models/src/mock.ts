import type { ImageProvider } from './image-provider'
import {
  CHAT_ROLE,
  type ChatContent,
  type ChatEvent,
  type ChatMessage,
  type LLMProvider,
} from './provider'
import type { JsonSchema } from './schema'
import { delay } from './util'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const DEFAULT_CHUNK_DELAY_MS = 18
const DEFAULT_IMAGE_DELAY_MS = 700

const DEFAULT_RESPONSE =
  'This response was generated in your browser — no API key or backend required. ' +
  'Wire in a real provider to see live model output.'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Chat (LLM) Provider
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface MockProviderOptions {
  // Milliseconds between streamed word chunks; 0 emits in one shot. Default 18.
  chunkDelayMs?: number
  // Override the generated text for a plain (non-structured) response. The last
  // user message is passed in so it can echo the prompt.
  respond?: (prompt: string) => string
}

// A zero-dependency mock that streams placeholder output without any network —
// for docs/preview embeds. Tools are ignored; a declared output schema yields
// shape-matching JSON so downstream nodes never crash on a missing field.
export const createMockProvider = (
  options: MockProviderOptions = {},
): LLMProvider => ({
  structuredOutputWithTools: true,
  acceptsImageUrls: true,
  invoke: async function* ({ messages, outputSchema, signal }) {
    const text = outputSchema
      ? JSON.stringify(sampleFromSchema(outputSchema), null, 2)
      : (options.respond?.(lastUserText(messages)) ?? DEFAULT_RESPONSE)
    yield* streamText(
      text,
      options.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS,
      signal,
    )
  },
})

async function* streamText(
  text: string,
  chunkDelayMs: number,
  signal: AbortSignal,
): AsyncIterable<ChatEvent> {
  // Word-sized chunks (whitespace kept) so the stream reads like a real model.
  for (const chunk of text.match(/\S+\s*/g) ?? [text]) {
    if (chunkDelayMs > 0) await delay(chunkDelayMs, signal)
    yield { type: 'content', delta: chunk }
  }
}

const lastUserText = (messages: ChatMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === CHAT_ROLE.USER) return contentToText(message.content)
  }
  return ''
}

const contentToText = (content: ChatContent): string =>
  typeof content === 'string'
    ? content
    : content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' ')

const sampleFromSchema = (schema: JsonSchema): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = sampleValue(prop.type)
  }
  return out
}

const sampleValue = (type: string): unknown => {
  if (type === 'number') return 42
  if (type === 'boolean') return true
  if (type === 'object') return {}
  return 'Sample value'
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Image Provider
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface MockImageProviderOptions {
  // Milliseconds to wait before resolving (simulated generation). Default 700.
  delayMs?: number
}

export const createMockImageProvider = (
  options: MockImageProviderOptions = {},
): ImageProvider => ({
  generate: async ({ prompt, size, signal }) => {
    await delay(options.delayMs ?? DEFAULT_IMAGE_DELAY_MS, signal)
    return { images: [placeholderImage(prompt, size)] }
  },
})

const placeholderImage = (
  prompt: string,
  size?: { width: number; height: number },
): string => {
  const width = size?.width ?? 512
  const height = size?.height ?? 512
  const label = escapeXml(truncate(prompt, 60))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><text x="50%" y="50%" fill="#ffffff" font-family="system-ui, sans-serif" font-size="${Math.round(width / 18)}" text-anchor="middle" dominant-baseline="middle" opacity="0.92">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
