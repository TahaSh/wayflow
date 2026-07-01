import {
  ARRAY_OP,
  ARRAY_OP_NAMES,
  type ArrayOpConfig,
  type ArrayOpName,
  COMPARE_OPERATORS,
  type CompareOperator,
  SORT_DIRECTION,
} from '@wayflow/agent'
import {
  createFieldLabel,
  createNumberInput,
  createSelectInput,
  createTextInput,
  createValueDisplay,
} from './controls'

interface CreateArrayOpFieldParams {
  value: unknown
  onChange: (value: ArrayOpConfig) => void
}

type ParamKey =
  | 'field'
  | 'separator'
  | 'count'
  | 'start'
  | 'end'
  | 'operator'
  | 'value'
  | 'direction'

// Which params each operation exposes — everything else stays hidden.
const PARAMS_BY_OP: Record<ArrayOpName, ParamKey[]> = {
  [ARRAY_OP.COUNT]: [],
  [ARRAY_OP.SUM]: ['field'],
  [ARRAY_OP.JOIN]: ['separator', 'field'],
  [ARRAY_OP.FIRST]: [],
  [ARRAY_OP.LAST]: [],
  [ARRAY_OP.TAKE]: ['count'],
  [ARRAY_OP.SLICE]: ['start', 'end'],
  [ARRAY_OP.FILTER]: ['field', 'operator', 'value'],
  [ARRAY_OP.SORT]: ['field', 'direction'],
  [ARRAY_OP.UNIQUE]: ['field'],
  [ARRAY_OP.PLUCK]: ['field'],
}

const PARAM_LABELS: Record<ParamKey, string> = {
  field: 'Field',
  separator: 'Separator',
  count: 'Count',
  start: 'Start',
  end: 'End',
  operator: 'Operator',
  value: 'Value',
  direction: 'Direction',
}

export const createArrayOpField = ({
  value,
  onChange,
}: CreateArrayOpFieldParams): HTMLElement => {
  let config: ArrayOpConfig =
    value && typeof value === 'object'
      ? (value as ArrayOpConfig)
      : { op: ARRAY_OP.COUNT }

  const commit = (next: ArrayOpConfig) => {
    config = next
    onChange(next)
  }

  const container = document.createElement('div')
  container.classList.add('wf-array-op')

  const params = document.createElement('div')
  params.classList.add('wf-array-op__params')

  container.append(
    createSelectInput({
      value: config.op,
      options: [...ARRAY_OP_NAMES],
      onChange: (op) => {
        commit({ ...config, op: op as ArrayOpName })
        renderParams()
      },
    }),
    params,
  )

  const renderParams = () => {
    params.innerHTML = ''
    for (const key of PARAMS_BY_OP[config.op]) {
      const wrapper = document.createElement('div')
      wrapper.classList.add('wf-array-op__param')
      wrapper.append(
        createFieldLabel({ text: PARAM_LABELS[key] }),
        controlFor(key),
      )
      params.appendChild(wrapper)
    }
  }

  const controlFor = (key: ParamKey): HTMLElement => {
    switch (key) {
      case 'field':
      case 'separator':
      case 'value':
        return createTextInput({
          value: typeof config[key] === 'string' ? config[key] : '',
          onChange: (v) => commit({ ...config, [key]: v }),
          commitOnBlur: true,
        })
      case 'count':
      case 'start':
      case 'end':
        return createNumberInput({
          value: typeof config[key] === 'number' ? config[key] : undefined,
          onChange: (v) => commit({ ...config, [key]: v }),
          commitOnBlur: true,
        })
      case 'operator':
        return createSelectInput({
          value: config.operator ?? COMPARE_OPERATORS[0],
          options: [...COMPARE_OPERATORS],
          onChange: (v) =>
            commit({ ...config, operator: v as CompareOperator }),
        })
      case 'direction':
        return createSelectInput({
          value: config.direction ?? SORT_DIRECTION.ASC,
          options: [SORT_DIRECTION.ASC, SORT_DIRECTION.DESC],
          onChange: (v) =>
            commit({ ...config, direction: v as ArrayOpConfig['direction'] }),
        })
    }
  }

  renderParams()
  return container
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Read-only Display
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createArrayOpValue = (value: unknown): HTMLElement => {
  const config: ArrayOpConfig =
    value && typeof value === 'object'
      ? (value as ArrayOpConfig)
      : { op: ARRAY_OP.COUNT }
  const parts: string[] = [config.op]
  for (const key of PARAMS_BY_OP[config.op]) {
    const v = config[key]
    if (v !== undefined && v !== '') parts.push(`${PARAM_LABELS[key]}: ${v}`)
  }
  return createValueDisplay(parts.join(' · '))
}
