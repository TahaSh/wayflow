import type { ProviderId } from './providers'

const STORAGE_KEY = 'wf-docs-byok'

export interface ByokConfig {
  provider: ProviderId
  key: string
}

type Listener = (config: ByokConfig | null) => void

const listeners = new Set<Listener>()

export const getConfig = (): ByokConfig | null => {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ByokConfig
  } catch {
    return null
  }
}

const broadcast = (config: ByokConfig | null): void => {
  for (const listener of listeners) listener(config)
}

export const setConfig = (config: ByokConfig): void => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  broadcast(config)
}

export const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
