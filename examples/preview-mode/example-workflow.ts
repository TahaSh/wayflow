import type { WorkflowEditor } from 'wayflow'

// A minimal Input → LLM → Output flow so the preview opens with something to
// pan, zoom, and tap into. Seeded inside editor.untracked() so it stays out of
// the undo history.
export const seedExampleWorkflow = (editor: WorkflowEditor): void => {
  editor.untracked(() => {
    const input = editor.addNode({
      type: 'input',
      position: { x: 120, y: 240 },
      data: { fields: [{ name: 'topic', dataType: 'string' }] },
    })

    const llm = editor.addNode({
      type: 'llm',
      position: { x: 460, y: 240 },
      data: {
        model: 'gpt-5.4-mini',
        prompt: 'Write a short, friendly note about {topic}.',
        outputSchema: [{ name: 'note', dataType: 'string' }],
      },
    })

    const output = editor.addNode({
      type: 'output',
      position: { x: 800, y: 240 },
      data: { fields: [{ name: 'note', dataType: 'string' }] },
    })

    editor.addEdge({
      sourceNodeId: input.id,
      sourcePortId: 'topic',
      targetNodeId: llm.id,
      targetPortId: 'topic',
    })
    editor.addEdge({
      sourceNodeId: llm.id,
      sourcePortId: 'note',
      targetNodeId: output.id,
      targetPortId: 'note',
    })
  })
}
