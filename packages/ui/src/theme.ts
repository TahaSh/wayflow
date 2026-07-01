// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const THEME = {
  AUTO: 'auto',
  DARK: 'dark',
  LIGHT: 'light',
} as const

export type Theme = (typeof THEME)[keyof typeof THEME]

const PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ThemeController {
  setTheme: (theme: Theme) => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Owns the `data-theme` attribute on the shell element. AUTO is resolved
// against `prefers-color-scheme` at apply time, and the controller tracks
// preference changes so the editor follows host OS/browser flips without
// the integrator re-calling setTheme.

export const createThemeController = (
  target: HTMLElement,
  initial: Theme = THEME.AUTO,
): ThemeController => {
  let current: Theme = initial

  const apply = (): void => {
    const resolved = current === THEME.AUTO ? resolveAutoTheme() : current
    target.setAttribute('data-theme', resolved)
  }

  apply()

  const mql = matchPrefersLight()
  const onPreferenceChange = (): void => {
    if (current === THEME.AUTO) apply()
  }
  mql?.addEventListener('change', onPreferenceChange)

  return {
    setTheme: (theme: Theme) => {
      current = theme
      apply()
    },
    destroy: () => {
      mql?.removeEventListener('change', onPreferenceChange)
    },
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const matchPrefersLight = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia(PREFERS_LIGHT_QUERY)
}

const resolveAutoTheme = (): typeof THEME.DARK | typeof THEME.LIGHT => {
  return matchPrefersLight()?.matches ? THEME.LIGHT : THEME.DARK
}
