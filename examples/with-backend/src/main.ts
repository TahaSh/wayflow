import './style.css'
import { marked } from 'marked'
import { createWorkflowEditor } from 'wayflow'
import { attachPending, run } from 'wayflow/runtime/client'
import { seedExampleWorkflow } from './example-workflow'

// The model lists come from the backend, not hardcoded arrays. One request feeds
// both the LLM and Image Generation pickers.
let models: Promise<{ llm: string[]; imageGeneration: string[] }> | undefined
const fetchModels = () =>
  (models ??= fetch('/api/models').then((r) => r.json()))

const editor = createWorkflowEditor(document.getElementById('editor')!, {
  debug: true,

  llm: { models: async () => (await fetchModels()).llm },
  imageGeneration: {
    models: async () => (await fetchModels()).imageGeneration,
  },

  // Bring your own markdown parser; Wayflow just styles the output.
  renderMarkdown: (md) => marked.parse(md) as string,

  // Run the graph on the backend, streaming execution back into the canvas.
  // Aborting `signal` (the Cancel button) cancels the run on the server.
  onRun: async ({ inputs, signal }) => {
    await run({
      url: '/api/run',
      resumeUrl: '/api/resume',
      cancelUrl: '/api/cancel',
      editor,
      inputs,
      signal,
    })
  },

  // The run's checkpoint outlives the page, so on load re-show any review still
  // waiting on the server — the approval card survives a reload.
  onReady: () =>
    attachPending({
      pendingUrl: '/api/pending',
      resumeUrl: '/api/resume',
      cancelUrl: '/api/cancel',
      editor,
    }),

  // The host owns persistence. The editor autosaves the workflow to the
  // backend, which stores it as-is (see server/index.ts).
  persistence: {
    load: async () => {
      const res = await fetch('/api/workflow')
      return res.status === 404 ? null : res.json()
    },
    save: async (snapshot) => {
      await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
    },
  },
})

// Seed the example synchronously. Persistence treats it as the baseline: a
// saved workflow replaces it on load, or it's persisted as-is on first run.
seedExampleWorkflow(editor)
