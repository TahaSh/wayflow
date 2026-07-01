import './style.css'
import { createWorkflowEditor } from 'wayflow'
import { createLLMHandler, createMockProvider } from 'wayflow/models'
import { createRuntime } from 'wayflow/runtime'
import { runInBrowser } from 'wayflow/runtime/client'
import { seedExampleWorkflow } from './example-workflow'

// A mock provider runs the graph entirely in the browser — no API key, no
// backend — so the preview is fully interactive. Swap in a real provider
// (createOpenAIProvider) to call an actual model.
const runtime = createRuntime({
  handlers: {
    llm: createLLMHandler(createMockProvider()),
  },
})

// The key button owns no storage: persist the key yourself, and return true from
// isActive once one is set so the button takes an accent style and swaps to
// activeLabel — a returning visitor sees their key is already there. The mock
// provider ignores the key; wire it into a real provider to actually use it.
const KEY_STORAGE = 'wayflow-preview-key'
const loadKey = () => localStorage.getItem(KEY_STORAGE) ?? ''

// Preview mode embeds a read-only workflow in a page: a minimal shell with a
// footer, pan / zoom / pinch, and a Result panel that slides in when you tap a
// node — from the right on desktop, the bottom on a phone.
const editor = createWorkflowEditor(document.getElementById('editor')!, {
  mode: 'preview',
  llm: { models: ['gpt-5.4-mini'] },
  preview: {
    footer: { end: 'wayflow' },
    themeToggle: true,
    keyButton: {
      onSubmit: (key) => localStorage.setItem(KEY_STORAGE, key),
      isActive: () => Boolean(loadKey()),
      activeLabel: 'Your key',
    },
  },
  onRun: async ({ inputs, signal }) => {
    await runInBrowser({ runtime, editor, inputs, signal })
  },
})

seedExampleWorkflow(editor)
editor.fitView()
