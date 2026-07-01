import type { JsonSchema } from '@wayflow/agent'
import type { JsonSchema as OutputJsonSchema } from './schema'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const CHAT_ROLE = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
} as const

export type ChatRole = (typeof CHAT_ROLE)[keyof typeof CHAT_ROLE]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Content (text or multimodal parts)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string }
  | { type: 'image_base64'; mediaType: string; data: string }

export type ChatContent = string | ChatContentPart[]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Tools
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ChatTool {
  name: string
  description: string
  parameters: JsonSchema
}

export interface ChatToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  // Set when the model's streamed argument JSON couldn't be parsed. The handler
  // feeds this back to the model as a tool error instead of executing the tool.
  argsParseError?: string
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Messages
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export type ChatMessage =
  | { role: typeof CHAT_ROLE.SYSTEM; content: ChatContent }
  | { role: typeof CHAT_ROLE.USER; content: ChatContent }
  | {
      role: typeof CHAT_ROLE.ASSISTANT
      content: ChatContent
      toolCalls?: ChatToolCall[]
    }
  | { role: typeof CHAT_ROLE.TOOL; toolCallId: string; content: string }

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Provider Contract
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export type ChatEvent =
  | { type: 'content'; delta: string }
  | ({ type: 'tool_call' } & ChatToolCall)

export interface LLMProvider {
  invoke(opts: {
    model: string
    messages: ChatMessage[]
    tools: ChatTool[]
    temperature?: number
    maxTokens?: number
    outputSchema?: OutputJsonSchema
    signal: AbortSignal
  }): AsyncIterable<ChatEvent>
  structuredOutputWithTools?: boolean
  // Whether the backend accepts remote image URLs. When false, the handler
  // inlines them as base64 before invoking. Defaults to true.
  acceptsImageUrls?: boolean
}
