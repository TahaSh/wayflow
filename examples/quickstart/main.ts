import './style.css'
import { createLocalStoragePersistence, createWorkflowEditor } from 'wayflow'
import { seedExampleWorkflow } from './example-workflow'

// The whole editor in one call — canvas, node palette, config panel, run
// controls. No backend here, so it's a design surface; the graph autosaves
// to localStorage.
const editor = createWorkflowEditor(document.getElementById('editor')!, {
  persistence: createLocalStoragePersistence('wayflow-quickstart'),
  llm: { models: ['gpt-5.4-mini', 'claude-sonnet-4-6'] },
})

seedExampleWorkflow(editor)
