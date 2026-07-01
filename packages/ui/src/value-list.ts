import { createIcon } from './icons'

interface CreateListValueInputParams {
  value: unknown[]
  onChange: (value: unknown[]) => void
  renderItem: (
    value: unknown,
    onItemChange: (v: unknown) => void,
  ) => HTMLElement
  addLabel?: string
}

// A repeatable list of values: rows of a caller-rendered leaf input, each with a
// remove button, plus an add button. Owns only the row/add/remove scaffolding;
// the per-type leaf stays with the caller so it reuses the right control.
export const createListValueInput = ({
  value,
  onChange,
  renderItem,
  addLabel = '+ Add value',
}: CreateListValueInputParams): HTMLElement => {
  const container = document.createElement('div')
  container.classList.add('wf-list-values')

  let items: unknown[] = Array.isArray(value) ? [...value] : []

  const render = () => {
    container.innerHTML = ''

    items.forEach((item, index) => {
      const row = document.createElement('div')
      row.classList.add('wf-list-values__row')

      const leaf = renderItem(item, (v) => {
        // In place so the leaf keeps focus; only add/remove re-render.
        items = items.map((it, i) => (i === index ? v : it))
        onChange(items)
      })
      leaf.classList.add('wf-list-values__leaf')

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.classList.add('wf-list-values__remove')
      remove.setAttribute('aria-label', 'Remove value')
      remove.appendChild(createIcon({ name: 'x', size: 13 }))
      remove.addEventListener('click', () => {
        items = items.filter((_, i) => i !== index)
        onChange(items)
        render()
      })

      row.append(leaf, remove)
      container.appendChild(row)
    })

    const add = document.createElement('button')
    add.type = 'button'
    add.classList.add('wf-list-values__add')
    add.textContent = addLabel
    add.addEventListener('click', () => {
      items = [...items, undefined]
      onChange(items)
      render()
    })
    container.appendChild(add)
  }

  render()
  return container
}
