import { type ByokConfig, getConfig, setConfig } from './key-store'
import { DEFAULT_PROVIDER, PROVIDERS, type ProviderId } from './providers'

const TITLE = 'Run with your own key'
const DISCLOSURE =
  'Stored only in this browser for this session and sent directly to the provider — never to a Wayflow server. Prefer a scoped or throwaway key.'

interface KeyModalHandle {
  open: () => void
}

let instance: KeyModalHandle | null = null

export const openKeyModal = (): void => {
  instance ??= createKeyModal()
  instance.open()
}

const createButton = (
  label: string,
  variant: 'btn--primary' | 'btn--ghost',
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.add('btn', variant)
  button.textContent = label
  return button
}

const createKeyModal = (): KeyModalHandle => {
  const scrim = document.createElement('div')
  scrim.classList.add('keymodal-scrim')

  const card = document.createElement('div')
  card.classList.add('keymodal')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  card.setAttribute('aria-label', TITLE)
  scrim.appendChild(card)

  const title = document.createElement('h2')
  title.classList.add('keymodal__title')
  title.textContent = TITLE
  card.appendChild(title)

  const disclosure = document.createElement('p')
  disclosure.classList.add('keymodal__note')
  disclosure.textContent = DISCLOSURE
  card.appendChild(disclosure)

  const select = document.createElement('select')
  select.classList.add('keymodal__select')
  select.setAttribute('aria-label', 'Provider')
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = PROVIDERS[id].label
    select.appendChild(option)
  }
  card.appendChild(select)

  const input = document.createElement('input')
  input.type = 'password'
  input.classList.add('keymodal__input')
  input.autocomplete = 'off'
  input.spellcheck = false
  card.appendChild(input)

  const syncPlaceholder = () => {
    input.placeholder = select.value === 'anthropic' ? 'sk-ant-…' : 'sk-…'
  }
  select.addEventListener('change', syncPlaceholder)

  const actions = document.createElement('div')
  actions.classList.add('keymodal__actions')
  const clearButton = createButton('Clear key', 'btn--ghost')
  const saveButton = createButton('Save', 'btn--primary')
  actions.append(clearButton, saveButton)
  card.appendChild(actions)

  const close = () => {
    scrim.classList.remove('open')
  }

  const save = () => {
    setConfig({ provider: select.value as ProviderId, key: input.value.trim() })
    close()
  }

  saveButton.addEventListener('click', save)
  clearButton.addEventListener('click', () => {
    setConfig({ provider: select.value as ProviderId, key: '' })
    close()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save()
  })
  scrim.addEventListener('pointerdown', (e) => {
    if (e.target === scrim) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && scrim.classList.contains('open')) close()
  })

  document.body.appendChild(scrim)

  return {
    open: () => {
      const config: ByokConfig | null = getConfig()
      select.value = config?.provider ?? DEFAULT_PROVIDER
      input.value = config?.key ?? ''
      clearButton.hidden = !config?.key
      syncPlaceholder()
      scrim.classList.add('open')
      input.focus()
    },
  }
}
