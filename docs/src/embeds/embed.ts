import { marked } from 'marked'
import { createWorkflowEditor, type Theme, type WorkflowEditor } from 'wayflow'
import {
  createLLMHandler,
  createMockProvider,
  type LLMProvider,
} from 'wayflow/models'
import { createOpenAIProvider } from 'wayflow/models/openai'
import { createRuntime } from 'wayflow/runtime'
import { runInBrowser } from 'wayflow/runtime/client'
import { openKeyModal } from './key-modal'
import { type ByokConfig, getConfig, subscribe } from './key-store'
import { DEFAULT_PROVIDER, PROVIDERS, type ProviderId } from './providers'

const COMPACT_WIDTH = 640

const MOBILE_NOTE = 'Open on a larger screen to edit the full workflow'
const MOCK_NOTE = 'Running in your browser — responses are simulated'
const LIVE_NOTE = 'Running live with your own key'

export interface EmbedOptions {
  // Seeds this demo's starting graph.
  seed: (editor: WorkflowEditor) => void
  // The provider used until a visitor brings their own key. Defaults to the
  // generic simulated provider; a demo can supply canned, graph-aware output.
  mockProvider?: () => LLMProvider
}

const docsTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'

export const createEmbed = (
  root: HTMLElement,
  { seed, mockProvider = createMockProvider }: EmbedOptions,
): (() => void) => {
  const canvas = root.querySelector<HTMLElement>('.embed__canvas')
  if (!canvas) return () => {}

  const resolveProvider = async (): Promise<LLMProvider> => {
    const config = getConfig()
    if (!config?.key) return mockProvider()
    const provider = PROVIDERS[config.provider]
    const { default: OpenAI } = await import('openai')
    return createOpenAIProvider({
      client: new OpenAI({
        apiKey: config.key,
        baseURL: provider.baseUrl,
        defaultHeaders: provider.headers,
        dangerouslyAllowBrowser: true,
      }),
    })
  }

  const compact = window.innerWidth <= COMPACT_WIDTH

  const editor = createWorkflowEditor(canvas, {
    mode: compact ? 'preview' : 'edit',
    theme: docsTheme(),
    renderMarkdown: (md) => marked.parse(md, { async: false }),
    llm: { models: PROVIDERS[DEFAULT_PROVIDER].models },
    ui: { configPanel: { initialWidth: 280 } },
    preview: compact
      ? { footer: false, keyButton: false, zoom: false }
      : undefined,
    onRun: async ({ inputs, signal }) => {
      const provider = await resolveProvider()
      const runtime = createRuntime({
        handlers: {
          llm: createLLMHandler(provider),
        },
      })
      await runInBrowser({ runtime, editor, inputs, signal })
    },
  })
  seed(editor)
  editor.fitView()

  const note = root.querySelector<HTMLElement>('.embed__note')
  const keyButton = root.querySelector<HTMLElement>('.embed__key')
  const keyLabel = root.querySelector<HTMLElement>('.embed__key-label')
  keyButton?.addEventListener('click', () => openKeyModal())

  const llmNodeIds = (): string[] =>
    Object.values(editor.getGraph().nodes)
      .filter((node) => node.type === 'llm')
      .map((node) => node.id)

  // Switching provider swaps the config-panel model list and drops that
  // provider's default onto the LLM node (what preview runs; the edit-mode
  // config panel can then pick another). Key only toggles Demo ↔ Live.
  let appliedProvider: ProviderId | null = null

  const applyConfig = (config: ByokConfig | null) => {
    const provider = config?.provider ?? DEFAULT_PROVIDER
    if (provider !== appliedProvider) {
      appliedProvider = provider
      const { models, defaultModel } = PROVIDERS[provider]
      editor.setModels({ llm: models })
      editor.untracked(() => {
        for (const id of llmNodeIds()) {
          editor.updateNodeConfig(id, { model: defaultModel })
        }
      })
    }

    const live = Boolean(config?.key)
    if (keyLabel) keyLabel.textContent = live ? 'Live' : 'Use your key'
    if (keyButton) {
      keyButton.dataset.state = live ? 'live' : 'demo'
      keyButton.title = live
        ? 'Running with your key — click to manage'
        : 'Responses are simulated — click to run with your key'
    }
    if (note)
      note.textContent = compact ? MOBILE_NOTE : live ? LIVE_NOTE : MOCK_NOTE
  }
  applyConfig(getConfig())
  const unsubscribe = subscribe(applyConfig)

  const themeObserver = new MutationObserver(() => editor.setTheme(docsTheme()))
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  return () => {
    unsubscribe()
    themeObserver.disconnect()
    editor.destroy()
  }
}
