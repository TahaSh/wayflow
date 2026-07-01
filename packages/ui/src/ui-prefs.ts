// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const PREFIX = 'wf:'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface Pref<T> {
  get: () => T
  set: (value: T) => void
  // Whether a value has been stored (vs. falling back to the default).
  has: () => boolean
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factories
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A preference backed by localStorage. `decode` returns undefined for missing or
// corrupt values so `get` falls back to `fallback`. Access is wrapped so an
// unavailable store (private mode, quota) can never throw.
const pref = <T>(
  key: string,
  fallback: T,
  decode: (raw: string) => T | undefined,
  encode: (value: T) => string,
): Pref<T> => ({
  get: () => {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw !== null) {
        const decoded = decode(raw)
        if (decoded !== undefined) return decoded
      }
    } catch {
      // Storage unavailable.
    }
    return fallback
  },
  set: (value) => {
    try {
      localStorage.setItem(PREFIX + key, encode(value))
    } catch {
      // Storage unavailable.
    }
  },
  has: () => {
    try {
      return localStorage.getItem(PREFIX + key) !== null
    } catch {
      return false
    }
  },
})

const numberPref = (key: string, fallback: number): Pref<number> =>
  pref(
    key,
    fallback,
    (raw) => {
      const value = Number(raw)
      return Number.isFinite(value) ? value : undefined
    },
    String,
  )

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Preferences
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const INSPECTOR_WIDTH = numberPref('inspectorWidth', 320)
