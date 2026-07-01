import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { deserialize } from 'wayflow/core'
import {
  createMemoryCheckpointStore,
  createRunSessions,
  type ResumeRequest,
} from 'wayflow/runtime'
import { streamResponse } from 'wayflow/runtime/sse'
import { IMAGE_MODELS, MODELS, runtime } from './runtime'

interface RunRequest {
  graph: string
  inputs?: Record<string, unknown>
}

const app = new Hono()
app.use('/api/*', cors())

// Run sessions hold a paused run's checkpoint between request and resume, so a
// Human Review node can pause the run and continue once the human decides.
const sessions = createRunSessions(runtime, {
  store: createMemoryCheckpointStore(),
})

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/models', (c) =>
  c.json({ llm: MODELS, imageGeneration: IMAGE_MODELS }),
)

// The host owns persistence; to the server the workflow is just data it stores
// and returns without ever parsing the graph. In-memory here: it survives
// browser reloads but resets on restart. Swap for a database in a real app.
let savedWorkflow: string | null = null

app.get('/api/workflow', (c) =>
  savedWorkflow === null
    ? c.body(null, 404)
    : c.body(savedWorkflow, 200, { 'content-type': 'application/json' }),
)

app.put('/api/workflow', async (c) => {
  savedWorkflow = await c.req.text()
  return c.body(null, 204)
})

app.post('/api/run', async (c) => {
  let body: RunRequest
  try {
    body = await c.req.json<RunRequest>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // The client sends the serialized graph; deserialize reconstructs it to run.
  let graph: ReturnType<typeof deserialize>
  try {
    graph = deserialize(body.graph)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Invalid graph payload' },
      400,
    )
  }

  // streamResponse returns a standard Fetch `Response`, so any framework works.
  // For Node-style req/res (Express, etc.), use `writeSSE` instead — see docs.
  // sessions.stream pauses + persists a checkpoint at a Human Review node.
  // Aborting the request (the editor's Cancel button) cancels the run.
  return streamResponse(
    sessions.stream(graph, { inputs: body.inputs, signal: c.req.raw.signal }),
  )
})

// Resume a paused run with the human's decision; streams the rest of the run.
app.post('/api/resume', async (c) => {
  const { runId, decision } = await c.req.json<Omit<ResumeRequest, 'signal'>>()
  const events = await sessions.resumeStream({
    runId,
    decision,
    signal: c.req.raw.signal,
  })
  if (!events) return c.json({ error: 'Unknown or already-resumed run' }, 404)
  return streamResponse(events)
})

// Drop a paused run's checkpoint when the human cancels the review.
app.post('/api/cancel', async (c) => {
  const { runId } = await c.req.json<{ runId: string }>()
  await sessions.cancel(runId)
  return c.body(null, 204)
})

// Reviews still waiting on the server. The editor re-attaches to these on load,
// so an approval card survives a page reload. A real app scopes these to the
// signed-in user; the in-memory store here returns them all.
app.get('/api/pending', async (c) => c.json(await sessions.listPending()))

const PORT = Number(process.env.PORT ?? 3001)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[example-with-backend] http://localhost:${PORT}`)
})
