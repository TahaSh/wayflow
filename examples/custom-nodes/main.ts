import './style.css'
import {
  BUILTIN_NODE_TYPES,
  createWorkflowEditor,
  type NodeTypeDefinition,
} from 'wayflow'

// Add your own node type to the editor: declare its ports, config, and icon,
// then draw interactive content inside it. Here, an "HTTP Request" node with a
// method badge and a URL field that stays in sync with the config panel.

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  1. Define a new node type with input + output ports
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const httpRequest: NodeTypeDefinition = {
  label: 'HTTP Request',
  category: 'Custom',
  icon: 'http',
  ports: {
    inputs: [{ id: 'body', dataType: 'json', label: 'Body' }],
    outputs: [{ id: 'response', dataType: 'json', label: 'Response' }],
  },
  configSchema: {
    method: {
      type: 'select',
      label: 'Method',
      default: 'GET',
      options: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    url: {
      type: 'text',
      label: 'URL',
      default: '',
    },
  },
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  DELETE: '#ef4444',
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  2. Register the type and render interactive content
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Use every preset except Image Generation.
const { imageGeneration, ...presets } = BUILTIN_NODE_TYPES

const editor = createWorkflowEditor(document.getElementById('editor')!, {
  nodeTypes: { ...presets, http: httpRequest },
  llm: { models: ['gpt-5.4-mini', 'claude-sonnet-4-6'] },
  // Register your own icons by name — merged over the built-ins, so no need to
  // touch the library. The frame (24×24, stroke: currentColor) is supplied;
  // you provide the inner paths. This one is a request/response glyph.
  icons: {
    http: '<path d="M3 9h16"/><path d="m16 6 3 3-3 3"/><path d="M21 15H5"/><path d="m8 12-3 3 3 3"/>',
  },
  nodeRenderers: {
    http: (container, { node, updateData }) => {
      const row = document.createElement('div')
      row.style.cssText = 'display: flex; gap: 6px; align-items: center;'

      const badge = document.createElement('span')
      const setBadge = (method: string) => {
        badge.textContent = method
        badge.style.cssText = `
          padding: 4px 8px;
          background: ${METHOD_COLORS[method] ?? METHOD_COLORS.GET};
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          font-family: ui-monospace, monospace;
        `
      }
      setBadge((node.data.method as string) ?? 'GET')

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'https://api.example.com/...'
      input.value = (node.data.url as string) ?? ''
      input.style.cssText = `
        flex: 1;
        min-width: 0;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 4px 8px;
        color: inherit;
        font-size: 12px;
        font-family: ui-monospace, monospace;
        outline: none;
      `
      input.addEventListener('input', () => {
        updateData({ url: input.value })
      })

      row.append(badge, input)
      container.appendChild(row)

      // Live-react to config-panel changes; the returned unsubscribe is the
      // node's cleanup, run when it's removed or re-rendered.
      return editor.on('dataChange', ({ nodeId, data }) => {
        if (nodeId !== node.id) return
        setBadge((data.method as string) ?? 'GET')
        const nextUrl = (data.url as string) ?? ''
        if (input.value !== nextUrl) input.value = nextUrl
      })
    },
  },
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  3. Seed a small workflow that uses the new node
//
//  Wrap seed mutations in editor.untracked() so they
//  don't pollute the user's undo history.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

editor.untracked(() => {
  // Input/Output ports are derived from their fields, so name a `body` and a
  // `response` field — both `json`, to match the HTTP node's ports.
  const inputNode = editor.addNode({
    type: 'input',
    position: { x: 80, y: 200 },
    data: { fields: [{ name: 'body', dataType: 'json' }] },
  })
  const httpNode = editor.addNode({
    type: 'http',
    position: { x: 380, y: 200 },
  })
  const outputNode = editor.addNode({
    type: 'output',
    position: { x: 760, y: 200 },
    data: { fields: [{ name: 'response', dataType: 'json' }] },
  })

  editor.addEdge({
    sourceNodeId: inputNode.id,
    sourcePortId: 'body',
    targetNodeId: httpNode.id,
    targetPortId: 'body',
  })
  editor.addEdge({
    sourceNodeId: httpNode.id,
    sourcePortId: 'response',
    targetNodeId: outputNode.id,
    targetPortId: 'response',
  })
})
