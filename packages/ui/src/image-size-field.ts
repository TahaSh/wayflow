import {
  DEFAULT_IMAGE_SIZE,
  IMAGE_SIZE_MODE,
  IMAGE_SIZE_PRESETS,
  type ImageSize,
  presetKey,
} from '@wayflow/agent'
import {
  createNumberInput,
  createSegmentedControl,
  createSelectInput,
  createValueDisplay,
} from './controls'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Preset Select
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface PresetSelectProps {
  preset: string
  onChange: (preset: string) => void
}

const createPresetSelect = ({
  preset,
  onChange,
}: PresetSelectProps): HTMLElement => {
  const keyByLabel = new Map(
    IMAGE_SIZE_PRESETS.map((p) => [p.label, presetKey(p)]),
  )
  const labelByKey = new Map(
    IMAGE_SIZE_PRESETS.map((p) => [presetKey(p), p.label]),
  )
  return createSelectInput({
    value: labelByKey.get(preset) ?? IMAGE_SIZE_PRESETS[0].label,
    options: IMAGE_SIZE_PRESETS.map((p) => p.label),
    onChange: (label) =>
      onChange(keyByLabel.get(label) ?? presetKey(IMAGE_SIZE_PRESETS[0])),
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Custom Dimensions
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface CustomSizeProps {
  width: number
  height: number
  onChange: (width: number, height: number) => void
}

const createCustomSize = ({
  width,
  height,
  onChange,
}: CustomSizeProps): HTMLElement => {
  const wrapper = document.createElement('div')
  wrapper.classList.add('wf-image-size-custom')

  let w = width
  let h = height

  const row = document.createElement('div')
  row.classList.add('wf-image-size-row')
  const widthInput = createNumberInput({
    value: w,
    min: 1,
    onChange: (v) => {
      w = v ?? 0
      onChange(w, h)
    },
  })
  const times = document.createElement('span')
  times.classList.add('wf-image-size-times')
  times.textContent = '×'
  const heightInput = createNumberInput({
    value: h,
    min: 1,
    onChange: (v) => {
      h = v ?? 0
      onChange(w, h)
    },
  })
  row.append(widthInput, times, heightInput)

  const hint = document.createElement('div')
  hint.classList.add('wf-image-size-hint')
  hint.textContent =
    'Some models accept only specific dimensions (e.g. multiples of 32).'

  wrapper.append(row, hint)
  return wrapper
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Field
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ImageSizeFieldProps {
  value: unknown
  onChange: (value: ImageSize) => void
}

export const createImageSizeField = ({
  value,
  onChange,
}: ImageSizeFieldProps): HTMLElement => {
  const initial = normalize(value)
  let mode = initial.mode
  let preset =
    initial.mode === IMAGE_SIZE_MODE.PRESET
      ? initial.preset
      : presetKey(IMAGE_SIZE_PRESETS[0])
  let width =
    initial.mode === IMAGE_SIZE_MODE.CUSTOM
      ? initial.width
      : IMAGE_SIZE_PRESETS[0].width
  let height =
    initial.mode === IMAGE_SIZE_MODE.CUSTOM
      ? initial.height
      : IMAGE_SIZE_PRESETS[0].height

  const container = document.createElement('div')
  container.classList.add('wf-image-size')
  const body = document.createElement('div')

  const commit = () => {
    onChange(
      mode === IMAGE_SIZE_MODE.CUSTOM
        ? { mode, width, height }
        : { mode: IMAGE_SIZE_MODE.PRESET, preset },
    )
  }

  const renderBody = () => {
    body.replaceChildren(
      mode === IMAGE_SIZE_MODE.CUSTOM
        ? createCustomSize({
            width,
            height,
            onChange: (w, h) => {
              width = w
              height = h
              commit()
            },
          })
        : createPresetSelect({
            preset,
            onChange: (p) => {
              preset = p
              commit()
            },
          }),
    )
  }

  const toggle = createSegmentedControl({
    options: [
      { label: 'Preset', value: IMAGE_SIZE_MODE.PRESET },
      { label: 'Custom', value: IMAGE_SIZE_MODE.CUSTOM },
    ],
    value: mode,
    onChange: (next) => {
      mode = next as ImageSize['mode']
      renderBody()
      commit()
    },
  })

  container.append(toggle, body)
  renderBody()
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Display
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createImageSizeValue = (value: unknown): HTMLElement => {
  const size = normalize(value)
  if (size.mode === IMAGE_SIZE_MODE.CUSTOM) {
    return createValueDisplay(`${size.width} × ${size.height}`)
  }
  const preset = IMAGE_SIZE_PRESETS.find((p) => presetKey(p) === size.preset)
  return createValueDisplay(preset?.label ?? size.preset)
}

const normalize = (value: unknown): ImageSize => {
  if (value && typeof value === 'object' && 'mode' in value) {
    return value as ImageSize
  }
  return DEFAULT_IMAGE_SIZE
}
