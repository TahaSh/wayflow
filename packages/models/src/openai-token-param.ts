// OpenAI's API requires 'max_completion_tokens'; other OpenAI-compatible
// backends use 'max_tokens'. Add a host here when a provider diverges.

export type MaxTokensParam = 'max_tokens' | 'max_completion_tokens'

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com'

const requiresCompletionTokens = (host: string): boolean =>
  host === 'api.openai.com' || host.endsWith('.openai.azure.com')

export const resolveMaxTokensParam = (
  baseUrl: string | undefined,
): MaxTokensParam => {
  let host: string
  try {
    host = new URL(baseUrl ?? OPENAI_DEFAULT_BASE_URL).hostname
  } catch {
    return 'max_tokens'
  }
  return requiresCompletionTokens(host) ? 'max_completion_tokens' : 'max_tokens'
}
