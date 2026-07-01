import OpenAI from 'openai'
import { createImageGenerationHandler, createLLMHandler } from 'wayflow/models'
import {
  createOpenAIImageProvider,
  createOpenAIProvider,
} from 'wayflow/models/openai'
import { createRuntime } from 'wayflow/runtime'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Bring your own LLM client
//
//  Wayflow never imports a vendor SDK — it duck-types
//  any OpenAI-compatible client. This points at Ollama
//  (free, local, no API key). To use a hosted provider
//  instead, swap these two lines:
//
//      new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
//
//  …and set MODEL to a hosted id (e.g. 'gpt-5.4-mini').
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const MODEL = 'qwen3.5:9b'
const IMAGE_MODEL = 'x/flux2-klein:latest'

const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
})

export const runtime = createRuntime({
  handlers: {
    llm: createLLMHandler({
      models: {
        'qwen*': createOpenAIProvider({
          client,
          // qwen3.5 reasons step by step before answering by default, which
          // is slow for a demo — turn it off.
          extraBody: { reasoning_effort: 'none' },
          // Ollama can't natively enforce a JSON schema, so ask for a JSON
          // object — Wayflow then describes the node's output schema to the
          // model for you.
          structuredOutput: 'jsonObject',
        }),
      },
    }),
    // The Image Generation node, served by an open-weights diffusion model over
    // the same OpenAI-compatible client.
    imageGeneration: createImageGenerationHandler({
      models: {
        'x/flux*': createOpenAIImageProvider({ client }),
      },
    }),
  },
  debug: true,
})

// The editor offers whatever the backend reports — never a hardcoded list.
export const MODELS = [MODEL]
export const IMAGE_MODELS = [IMAGE_MODEL]
