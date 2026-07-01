// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Size Mode
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const IMAGE_SIZE_MODE = {
  PRESET: 'preset',
  CUSTOM: 'custom',
} as const

export type ImageSizeMode =
  (typeof IMAGE_SIZE_MODE)[keyof typeof IMAGE_SIZE_MODE]

export type ImageSize =
  | { mode: typeof IMAGE_SIZE_MODE.PRESET; preset: string }
  | { mode: typeof IMAGE_SIZE_MODE.CUSTOM; width: number; height: number }

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Size Presets
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ImageSizePreset {
  label: string
  width: number
  height: number
}

// Common dimensions offered in the picker. Only 1024×1024 is accepted by every
// backend; others may be rejected by some models, surfaced as a run error.
export const IMAGE_SIZE_PRESETS: ImageSizePreset[] = [
  { label: '1024 × 1024 (square)', width: 1024, height: 1024 },
  { label: '512 × 512 (square)', width: 512, height: 512 },
  { label: '768 × 768 (square)', width: 768, height: 768 },
  { label: '1024 × 1792 (portrait)', width: 1024, height: 1792 },
  { label: '1792 × 1024 (landscape)', width: 1792, height: 1024 },
  { label: '1536 × 1024 (wide)', width: 1536, height: 1024 },
]

export const presetKey = (preset: ImageSizePreset): string =>
  `${preset.width}x${preset.height}`

export const DEFAULT_IMAGE_SIZE: ImageSize = {
  mode: IMAGE_SIZE_MODE.PRESET,
  preset: presetKey(IMAGE_SIZE_PRESETS[0]),
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Resolution
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Maps a stored size config to concrete dimensions for a backend request.
// Falls back to the first preset for malformed or out-of-range values.
export const resolveImageSize = (
  raw: unknown,
): { width: number; height: number } => {
  const fallback = {
    width: IMAGE_SIZE_PRESETS[0].width,
    height: IMAGE_SIZE_PRESETS[0].height,
  }
  if (!raw || typeof raw !== 'object') return fallback
  const size = raw as {
    mode?: string
    preset?: unknown
    width?: unknown
    height?: unknown
  }
  if (size.mode === IMAGE_SIZE_MODE.CUSTOM) {
    const width = Number(size.width)
    const height = Number(size.height)
    return isPositive(width) && isPositive(height)
      ? { width, height }
      : fallback
  }
  const match = /^(\d+)x(\d+)$/.exec(String(size.preset ?? ''))
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : fallback
}

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0
