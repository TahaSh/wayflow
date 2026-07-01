import {
  deserialize,
  type Graph,
  serialize,
  type Viewport,
} from '@wayflow/core'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const AUTOSAVE_DEBOUNCE_MS = 800

export const PERSISTENCE_STATE = {
  LOADING: 'loading',
  SAVED: 'saved',
  DRAFT: 'draft',
  SAVING: 'saving',
  ERROR: 'error',
} as const

export type PersistenceState =
  (typeof PERSISTENCE_STATE)[keyof typeof PERSISTENCE_STATE]

export const SAVE_TRIGGER = {
  AUTOSAVE: 'autosave',
  MANUAL: 'manual',
} as const

export type SaveTrigger = (typeof SAVE_TRIGGER)[keyof typeof SAVE_TRIGGER]

export const PERSISTENCE_PHASE = {
  SAVE: 'save',
  LOAD: 'load',
} as const

export type PersistencePhase =
  (typeof PERSISTENCE_PHASE)[keyof typeof PERSISTENCE_PHASE]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Adapters
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface EditorSnapshot {
  graph: Graph
  viewport?: Viewport
}

export interface PersistenceAdapter {
  load: () => EditorSnapshot | null | Promise<EditorSnapshot | null>
  save: (snapshot: EditorSnapshot) => void | Promise<void>
}

export interface PersistenceOptions {
  adapter: PersistenceAdapter
  trigger?: SaveTrigger
  debounce?: number
}

export type PersistenceConfig = PersistenceAdapter | PersistenceOptions

export const createLocalStoragePersistence = (
  key: string,
): PersistenceAdapter => ({
  load: () => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { graph: string; viewport?: Viewport }
      return { graph: deserialize(parsed.graph), viewport: parsed.viewport }
    } catch {
      // Corrupt or incompatible value — fall back to the seed; the next save overwrites it.
      return null
    }
  },
  save: (snapshot) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        graph: serialize(snapshot.graph),
        viewport: snapshot.viewport,
      }),
    )
  },
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Setup
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface SetupPersistenceParams {
  config: PersistenceConfig
  getSnapshot: () => EditorSnapshot
  applySnapshot: (snapshot: EditorSnapshot) => void
  onChange: (callback: () => void) => () => void
  onViewportChange: (callback: () => void) => () => void
  onStateChange: (state: PersistenceState) => void
  onError: (phase: PersistencePhase, error: unknown) => void
  isInScope: (target: EventTarget | null) => boolean
}

export interface PersistenceHandle {
  getState: () => PersistenceState
  save: () => Promise<void>
  destroy: () => void
}

export const setupPersistence = ({
  config,
  getSnapshot,
  applySnapshot,
  onChange,
  onViewportChange,
  onStateChange,
  onError,
  isInScope,
}: SetupPersistenceParams): PersistenceHandle => {
  const { adapter, trigger, debounce } = normalize(config)

  let state: PersistenceState = PERSISTENCE_STATE.LOADING
  // True while the seed is built and while a loaded snapshot is applied, so
  // neither counts as a user edit.
  let hydrating = true
  // Panning isn't an edit: the latest viewport rides along with the next save
  // and the unload flush rather than dirtying the graph on its own.
  let viewportDirty = false
  // Captured at save start to detect edits that land mid-save.
  let changeVersion = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let asyncAdapter = false

  const setState = (next: PersistenceState): void => {
    if (state === next) return
    state = next
    onStateChange(next)
  }

  // Rejects on failure: explicit save() callers see the error; the autosave
  // timer swallows it (the ERROR state and retry pill are the UX there).
  const doSave = async (): Promise<void> => {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
    const version = changeVersion
    setState(PERSISTENCE_STATE.SAVING)
    try {
      await adapter.save(getSnapshot())
    } catch (err) {
      setState(PERSISTENCE_STATE.ERROR)
      onError(PERSISTENCE_PHASE.SAVE, err)
      throw err
    }
    viewportDirty = false
    if (changeVersion !== version) {
      setState(PERSISTENCE_STATE.DRAFT)
      scheduleSave()
    } else {
      setState(PERSISTENCE_STATE.SAVED)
    }
  }

  const scheduleSave = (): void => {
    if (trigger !== SAVE_TRIGGER.AUTOSAVE) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void doSave().catch(() => {}), debounce)
  }

  const handleChange = (): void => {
    if (hydrating) return
    changeVersion++
    setState(PERSISTENCE_STATE.DRAFT)
    scheduleSave()
  }

  const handleViewportChange = (): void => {
    if (!hydrating) viewportDirty = true
  }

  const save = async (): Promise<void> => {
    if (hydrating || state === PERSISTENCE_STATE.LOADING) return
    if (state === PERSISTENCE_STATE.SAVING) return
    await doSave()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isInScope(event.target)) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save().catch(() => {})
    }
  }

  // Reliable for localStorage; best-effort for async adapters.
  const flushOnHide = (): void => {
    if (hydrating) return
    if (state === PERSISTENCE_STATE.DRAFT || viewportDirty) {
      void adapter.save(getSnapshot())
    }
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flushOnHide()
  }

  // Sync adapters always flush on hide; only async ones can lose an unsaved or
  // in-flight save to a reload, so only they warn before leaving.
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!asyncAdapter) return
    if (
      state === PERSISTENCE_STATE.DRAFT ||
      state === PERSISTENCE_STATE.SAVING ||
      state === PERSISTENCE_STATE.ERROR
    ) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  const offChange = onChange(handleChange)
  const offViewportChange = onViewportChange(handleViewportChange)
  document.addEventListener('keydown', onKeyDown as EventListener)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flushOnHide)
  window.addEventListener('beforeunload', onBeforeUnload)

  // Runs after the synchronous seed is in place: a stored snapshot replaces it,
  // otherwise the seed becomes the persisted baseline.
  const loaded = adapter.load()
  asyncAdapter = loaded instanceof Promise
  Promise.resolve(loaded)
    .then((snapshot) => {
      if (snapshot) {
        // Apply while still hydrating so the import's events aren't read as edits.
        applySnapshot(snapshot)
        hydrating = false
        viewportDirty = false
        setState(PERSISTENCE_STATE.SAVED)
      } else {
        hydrating = false
        void doSave().catch(() => {})
      }
    })
    .catch((err) => {
      hydrating = false
      setState(PERSISTENCE_STATE.ERROR)
      onError(PERSISTENCE_PHASE.LOAD, err)
    })

  return {
    getState: () => state,
    save,
    destroy: () => {
      clearTimeout(debounceTimer)
      offChange()
      offViewportChange()
      document.removeEventListener('keydown', onKeyDown as EventListener)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flushOnHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    },
  }
}

const normalize = (config: PersistenceConfig): Required<PersistenceOptions> => {
  const options = 'adapter' in config ? config : { adapter: config }
  return {
    adapter: options.adapter,
    trigger: options.trigger ?? SAVE_TRIGGER.AUTOSAVE,
    debounce: options.debounce ?? AUTOSAVE_DEBOUNCE_MS,
  }
}
