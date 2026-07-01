export type ProviderId = 'openai' | 'anthropic'

export interface ProviderConfig {
  label: string
  baseUrl?: string
  headers?: Record<string, string>
  models: string[]
  defaultModel: string
}

export const DEFAULT_PROVIDER: ProviderId = 'openai'

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.5'],
    defaultModel: 'gpt-5.4-mini',
  },
  anthropic: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1/',
    headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
    defaultModel: 'claude-haiku-4-5',
  },
}
