import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_SIZE,
  IMAGE_SIZE_PRESETS,
  presetKey,
  resolveImageSize,
} from 'wayflow/agent'

const fallback = {
  width: IMAGE_SIZE_PRESETS[0].width,
  height: IMAGE_SIZE_PRESETS[0].height,
}

describe('presetKey', () => {
  it('formats dimensions as WIDTHxHEIGHT', () => {
    expect(presetKey({ label: 'x', width: 512, height: 512 })).toBe('512x512')
  })
})

describe('resolveImageSize', () => {
  it('resolves a valid custom size', () => {
    expect(
      resolveImageSize({ mode: 'custom', width: 800, height: 600 }),
    ).toEqual({ width: 800, height: 600 })
  })

  it('falls back when a custom size is non-positive', () => {
    expect(
      resolveImageSize({ mode: 'custom', width: -1, height: 600 }),
    ).toEqual(fallback)
  })

  it('resolves a preset key into dimensions', () => {
    expect(resolveImageSize({ mode: 'preset', preset: '512x512' })).toEqual({
      width: 512,
      height: 512,
    })
  })

  it('falls back on a malformed or missing value', () => {
    expect(resolveImageSize({ mode: 'preset', preset: 'garbage' })).toEqual(
      fallback,
    )
    expect(resolveImageSize(null)).toEqual(fallback)
  })

  it('resolves the default size', () => {
    expect(resolveImageSize(DEFAULT_IMAGE_SIZE)).toEqual(fallback)
  })
})
