import type { Field } from '@wayflow/agent'
import type { ModelHandler } from './dispatch'
import { inlineRemoteImages, mapImageUrlError } from './images'
import {
  CHAT_ROLE,
  type ChatMessage,
  type ChatTool,
  type ChatToolCall,
  type LLMProvider,
} from './provider'
import { fieldsToJsonSchema, isStructured } from './schema'
import { buildMessages, mergeVariableDefaults } from './template'
import { delay } from './util'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Cap on model round-trips that may request tools before the handler forces a
// final tool-free answer. Stops a misbehaving model from looping forever.
const DEFAULT_MAX_STEPS = 20

// Retries a request that fails before any output has streamed (transient
// 429 / 5xx / dropped connection). Once output streams, errors propagate.
const DEFAULT_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const isAbortError = (err: unknown): boolean =>
  err instanceof Error && err.name === 'AbortError'

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

// A tool result the model reads as a failure, so it can retry or route around
// the tool instead of the run dying.
const toolError = (toolCallId: string, message: string): ChatMessage => ({
  role: CHAT_ROLE.TOOL,
  toolCallId,
  content: JSON.stringify({ error: message }),
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ChatHandlerOptions {
  // Max model round-trips that may request tools (default 20).
  maxSteps?: number
  // Retries before any output streams, on transient failures (default 2).
  retries?: number
}

export const createChatHandler = (
  provider: LLMProvider,
  options: ChatHandlerOptions = {},
): ModelHandler => {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const retries = options.retries ?? DEFAULT_RETRIES

  return async function* (node, inputs, ctx) {
    ctx.reportInputs(mergeVariableDefaults(node, inputs))
    const { system, user: rawUser } = buildMessages(node, inputs)
    const user =
      provider.acceptsImageUrls === false
        ? await inlineRemoteImages(rawUser, ctx.signal)
        : rawUser
    const outputFields = (node.data.outputSchema as Field[] | undefined) ?? []
    const structured = isStructured(outputFields)
    const outputSchema = structured
      ? fieldsToJsonSchema(outputFields)
      : undefined

    const tools: ChatTool[] = Object.entries(ctx.tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
    }))
    const hasTools = tools.length > 0
    // A JSON constraint can make a model skip tool calls, so unless the provider
    // enforces structure alongside tools, gather unconstrained and structure the
    // result in the tool-free call below.
    const inlineStructured =
      !hasTools || provider.structuredOutputWithTools === true

    const messages: ChatMessage[] = [
      ...(system ? [{ role: CHAT_ROLE.SYSTEM, content: system }] : []),
      { role: CHAT_ROLE.USER, content: user },
    ]

    const model = String(node.data.model)
    const temperature =
      typeof node.data.temperature === 'number'
        ? node.data.temperature
        : undefined
    const maxTokens =
      typeof node.data.maxTokens === 'number' ? node.data.maxTokens : undefined

    // Retries only before the first event of an attempt streams: replaying after
    // partial output would double-stream and double-charge the user.
    const invoke = async function* (
      opts: Parameters<LLMProvider['invoke']>[0],
    ) {
      for (let attempt = 0; ; attempt++) {
        let streamed = false
        try {
          for await (const event of provider.invoke(opts)) {
            streamed = true
            yield event
          }
          return
        } catch (err) {
          if (streamed || isAbortError(err) || attempt >= retries) {
            throw mapImageUrlError(err)
          }
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt, opts.signal)
        }
      }
    }

    let finalContent = ''
    for (let step = 0; ; step++) {
      // Once the cap is reached, drop tools so the model has to answer.
      const forceAnswer = step >= maxSteps
      let assistantContent = ''
      const calls: ChatToolCall[] = []

      for await (const event of invoke({
        model,
        messages,
        tools: forceAnswer ? [] : tools,
        temperature,
        maxTokens,
        outputSchema: inlineStructured ? outputSchema : undefined,
        signal: ctx.signal,
      })) {
        if (event.type === 'content') {
          assistantContent += event.delta
          if (!structured) yield event.delta
        } else {
          calls.push({
            id: event.id,
            name: event.name,
            args: event.args,
            argsParseError: event.argsParseError,
          })
        }
      }

      if (forceAnswer || calls.length === 0) {
        finalContent = assistantContent
        break
      }

      messages.push({
        role: CHAT_ROLE.ASSISTANT,
        content: assistantContent,
        toolCalls: calls,
      })

      // Run the batch concurrently; each call resolves to a tool message
      // (result or error) so one failure never sinks the others, and the
      // results stay in call order so every tool call is answered.
      const results = await Promise.all(
        calls.map(async (call): Promise<ChatMessage> => {
          if (call.argsParseError) {
            return toolError(
              call.id,
              `Arguments were not valid JSON: ${call.argsParseError}`,
            )
          }
          const tool = ctx.tools[call.name]
          if (!tool) return toolError(call.id, `Unknown tool "${call.name}"`)
          try {
            const result = await tool.handler(call.args, {
              signal: ctx.signal,
              runGraph: ctx.runGraph,
            })
            return {
              role: CHAT_ROLE.TOOL,
              toolCallId: call.id,
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
            }
          } catch (err) {
            if (isAbortError(err)) throw err
            return toolError(call.id, errorText(err))
          }
        }),
      )
      messages.push(...results)
    }

    if (!structured) return

    // Inline mode already produced JSON; otherwise structure the gathered text
    // in a tool-free call where the schema can be enforced.
    if (inlineStructured) {
      yield finalContent
    } else {
      // Frame it as a faithful reformat — otherwise the model summarizes the
      // gathered text and drops roughly half the detail.
      const reformat =
        'Convert the following into the required JSON, preserving every detail ' +
        'verbatim — do not summarize, shorten, or omit anything:\n\n' +
        finalContent
      for await (const event of invoke({
        model,
        messages: [{ role: CHAT_ROLE.USER, content: reformat }],
        tools: [],
        temperature,
        maxTokens,
        outputSchema,
        signal: ctx.signal,
      })) {
        if (event.type === 'content') yield event.delta
      }
    }
  }
}
