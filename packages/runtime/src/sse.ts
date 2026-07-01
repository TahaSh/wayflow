import { createError, ERROR_CODE, WayflowError } from '@wayflow/agent'
import { RUN_STATUS, type RuntimeEvent } from './protocol'

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

const formatEvent = (evt: RuntimeEvent): string =>
  `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`

// A failed run still ends with an error event the client can read, rather than a
// silently truncated stream.
const errorEvent = (err: unknown): RuntimeEvent => {
  const error =
    err instanceof WayflowError
      ? err.toJSON()
      : createError(
          ERROR_CODE.RUNTIME_HANDLER_THREW,
          undefined,
          err instanceof Error ? err : new Error(String(err)),
        ).toJSON()
  return { event: 'run_status', data: { status: RUN_STATUS.ERROR, error } }
}

export interface StreamResponseOptions {
  headers?: Record<string, string>
  status?: number
}

// Streams events as a web-standard Response, for servers built on the Fetch API.
export const streamResponse = (
  events: AsyncIterable<RuntimeEvent>,
  options: StreamResponseOptions = {},
): Response => {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of events) {
          controller.enqueue(encoder.encode(formatEvent(evt)))
        }
      } catch (err) {
        controller.enqueue(encoder.encode(formatEvent(errorEvent(err))))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    status: options.status ?? 200,
    headers: { ...SSE_HEADERS, ...options.headers },
  })
}

// A Node-style response: anything exposing setHeader, write, and end.
export interface SSEWritable {
  setHeader(name: string, value: string): void
  write(chunk: string): void
  end(): void
}

// Streams events to a Node-style response — the counterpart to streamResponse
// for servers that aren't built on the Fetch API.
export const writeSSE = async (
  res: SSEWritable,
  events: AsyncIterable<RuntimeEvent>,
): Promise<void> => {
  for (const [name, value] of Object.entries(SSE_HEADERS)) {
    res.setHeader(name, value)
  }
  try {
    for await (const evt of events) {
      res.write(formatEvent(evt))
    }
  } catch (err) {
    res.write(formatEvent(errorEvent(err)))
  } finally {
    res.end()
  }
}
