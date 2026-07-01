import type { WorkflowEditor } from 'wayflow'
import { createEmbed } from './embed'
import { DEFAULT_PROVIDER, PROVIDERS } from './providers'

const seed = (editor: WorkflowEditor): void => {
  editor.untracked(() => {
    const input = editor.addNode({
      type: 'input',
      position: { x: 120, y: 240 },
      data: {
        fields: [
          {
            name: 'text',
            dataType: 'string',
            default:
              'Coffee starts as a cherry-like fruit whose seeds are dried, ' +
              'roasted, and ground. Roasting is where most of the flavor ' +
              'forms, as heat triggers hundreds of aromatic compounds. ' +
              'Darker roasts taste bolder but actually contain slightly ' +
              'less caffeine.',
          },
        ],
      },
    })
    const llm = editor.addNode({
      type: 'llm',
      position: { x: 460, y: 240 },
      data: {
        model: PROVIDERS[DEFAULT_PROVIDER].defaultModel,
        prompt: 'Summarize the following in 2-3 sentences:\n\n{text}',
        outputSchema: [{ name: 'summary', dataType: 'string' }],
      },
    })
    const output = editor.addNode({
      type: 'output',
      position: { x: 800, y: 240 },
      data: { fields: [{ name: 'summary', dataType: 'string' }] },
    })
    editor.addEdge({
      sourceNodeId: input.id,
      sourcePortId: 'text',
      targetNodeId: llm.id,
      targetPortId: 'text',
    })
    editor.addEdge({
      sourceNodeId: llm.id,
      sourcePortId: 'summary',
      targetNodeId: output.id,
      targetPortId: 'summary',
    })
  })
}

export default (root: HTMLElement): (() => void) => createEmbed(root, { seed })
