import type { WorkflowEditor } from 'wayflow'
import { createMockProvider, type LLMProvider } from 'wayflow/models'
import { createEmbed } from './embed'
import { DEFAULT_PROVIDER, PROVIDERS } from './providers'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  The graph
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const seed = (editor: WorkflowEditor): void => {
  editor.untracked(() => {
    editor.setMetadata({ name: 'Blog Post Writer' })

    const model = PROVIDERS[DEFAULT_PROVIDER].defaultModel

    const input = editor.addNode({
      type: 'input',
      position: { x: 120, y: 560 },
      data: {
        fields: [
          {
            name: 'topic',
            dataType: 'string',
            default: 'why morning routines make you more productive',
          },
        ],
      },
    })

    // Outline first: a JSON array of headings the next step iterates over.
    // Raised above the main row so its sections edge drops cleanly into Write
    // while topic runs straight across the row.
    const outline = editor.addNode({
      type: 'llm',
      position: { x: 460, y: 240 },
      data: {
        model,
        prompt:
          'Break a blog post about {topic} into 4 short, descriptive ' +
          'section headings.',
        outputSchema: [
          { name: 'sections', dataType: 'string', multiple: true },
        ],
      },
    })
    editor.setNodeName(outline.id, 'Outline')

    // "Run once per item": written for one heading, the runtime iterates the
    // sections list and collects each body back into a list. `topic` is scalar,
    // so it's broadcast unchanged to every section.
    const write = editor.addNode({
      type: 'llm',
      position: { x: 800, y: 560 },
      data: {
        model,
        runPerItem: true,
        prompt:
          "Write 2-3 short paragraphs for the section titled '{section}' of a " +
          'blog post about {topic}. Begin with a "## {section}" markdown ' +
          'heading. Write only that section.',
        outputSchema: [{ name: 'body', dataType: 'string' }],
      },
    })
    editor.setNodeName(write.id, 'Write Sections')

    // Reducing op: the list of section bodies collapses to one markdown string.
    const join = editor.addNode({
      type: 'arrayOps',
      position: { x: 1120, y: 560 },
      data: { operation: { op: 'join', separator: '\n\n' } },
    })
    editor.setNodeName(join.id, 'Join Sections')

    const output = editor.addNode({
      type: 'output',
      position: { x: 1440, y: 560 },
      data: {
        fields: [{ name: 'article', dataType: 'string', format: 'markdown' }],
      },
    })

    editor.addEdge({
      sourceNodeId: input.id,
      sourcePortId: 'topic',
      targetNodeId: outline.id,
      targetPortId: 'topic',
    })
    editor.addEdge({
      sourceNodeId: input.id,
      sourcePortId: 'topic',
      targetNodeId: write.id,
      targetPortId: 'topic',
    })
    editor.addEdge({
      sourceNodeId: outline.id,
      sourcePortId: 'sections',
      targetNodeId: write.id,
      targetPortId: 'section',
    })
    editor.addEdge({
      sourceNodeId: write.id,
      sourcePortId: 'body',
      targetNodeId: join.id,
      targetPortId: 'list',
    })
    editor.addEdge({
      sourceNodeId: join.id,
      sourcePortId: 'result',
      targetNodeId: output.id,
      targetPortId: 'article',
    })
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Simulated provider (no key)
//
//  The generic mock fills a declared schema with sample values, which can't
//  produce the array the Outline node needs. So the structured Outline call is
//  answered with canned headings here, while each plain per-section call falls
//  through to the mock with a body keyed to its heading. Bring a key and the
//  real provider replaces this entirely.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const SECTIONS = [
  'Why It Matters',
  'Getting Started',
  'Common Pitfalls',
  'Key Takeaways',
]

const sectionBody = (prompt: string): string => {
  const title = prompt.match(/section titled '([^']+)'/)?.[1] ?? 'This Section'
  return [
    `## ${title}`,
    `${title} sets the stage by grounding the reader in what matters and ` +
      'why it deserves their attention, turning a loose idea into something ' +
      'concrete they can follow.',
    'From there the details do the work: a clear example, a practical step, ' +
      'and a takeaway the reader can act on right away — tight, useful, and ' +
      'earning its place in the post.',
  ].join('\n\n')
}

const createBlogMockProvider = (): LLMProvider => {
  const base = createMockProvider({ respond: sectionBody })
  return {
    structuredOutputWithTools: true,
    acceptsImageUrls: true,
    invoke: async function* (params) {
      if (!params.outputSchema) {
        yield* base.invoke(params)
        return
      }
      yield { type: 'content', delta: JSON.stringify({ sections: SECTIONS }) }
    },
  }
}

export default (root: HTMLElement): (() => void) =>
  createEmbed(root, { seed, mockProvider: createBlogMockProvider })
