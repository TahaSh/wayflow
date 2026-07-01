import { describe, expect, it } from 'vitest'
import {
  type ChatEvent,
  type ChatMessage,
  createMockImageProvider,
  createMockProvider,
  type JsonSchema,
} from 'wayflow/models'

const collect = async (events: AsyncIterable<ChatEvent>): Promise<string> => {
  let text = ''
  for await (const event of events) {
    if (event.type === 'content') text += event.delta
  }
  return text
}

const messages: ChatMessage[] = [
  { role: 'user', content: 'Summarize the ticket' },
]

const live = () => new AbortController().signal

describe('createMockProvider', () => {
  it('streams placeholder text when there is no output schema', async () => {
    const provider = createMockProvider({ chunkDelayMs: 0 })
    const text = await collect(
      provider.invoke({ model: 'mock', messages, tools: [], signal: live() }),
    )
    expect(text.length).toBeGreaterThan(0)
  })

  it('honors a custom respond()', async () => {
    const provider = createMockProvider({
      chunkDelayMs: 0,
      respond: (prompt) => `echo: ${prompt}`,
    })
    const text = await collect(
      provider.invoke({ model: 'mock', messages, tools: [], signal: live() }),
    )
    expect(text).toBe('echo: Summarize the ticket')
  })

  it('emits schema-shaped JSON for structured output', async () => {
    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        category: { type: 'string' },
        urgency: { type: 'number' },
        resolved: { type: 'boolean' },
      },
      required: ['category', 'urgency', 'resolved'],
      additionalProperties: false,
    }
    const provider = createMockProvider({ chunkDelayMs: 0 })
    const text = await collect(
      provider.invoke({
        model: 'mock',
        messages,
        tools: [],
        outputSchema,
        signal: live(),
      }),
    )
    const parsed = JSON.parse(text)
    expect(Object.keys(parsed).sort()).toEqual([
      'category',
      'resolved',
      'urgency',
    ])
    expect(typeof parsed.category).toBe('string')
    expect(typeof parsed.urgency).toBe('number')
    expect(typeof parsed.resolved).toBe('boolean')
  })

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider = createMockProvider()
    await expect(
      collect(
        provider.invoke({
          model: 'mock',
          messages,
          tools: [],
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('createMockImageProvider', () => {
  it('returns a placeholder image data-URI', async () => {
    const provider = createMockImageProvider({ delayMs: 0 })
    const result = await provider.generate({
      model: 'mock',
      prompt: 'a friendly robot',
      signal: live(),
    })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].startsWith('data:image/svg+xml,')).toBe(true)
  })
})
