// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Docs — shared client behavior (no framework)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const THEME_KEY = 'wf-docs-theme'
const COPY_RESET_MS = 1400

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Theme
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type Theme = 'dark' | 'light'

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {}
}

function initTheme() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('[data-theme-toggle]')) return
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Copy buttons
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

function resolveCopyText(button: HTMLElement): string {
  const raw = button.getAttribute('data-copy') ?? ''
  if (raw === '__prev__') {
    return button.closest('.code')?.querySelector('pre')?.innerText ?? ''
  }
  if (raw === '__cmd__') {
    return (
      button.closest('.command')?.querySelector<HTMLElement>('[data-cmd-text]')
        ?.textContent ?? ''
    )
  }
  if (raw === '__tab__') {
    const panel = button
      .closest('.codetabs')
      ?.querySelector<HTMLElement>('.codetabs__panel.is-active')
    const command = panel?.querySelector<HTMLElement>('[data-cmd-text]')
    if (command) return command.textContent ?? ''
    return panel?.querySelector('pre')?.innerText ?? ''
  }
  return raw
}

function flashCopied(button: HTMLElement) {
  const label = button.querySelector<HTMLElement>('[data-copy-label]')
  const previous = label?.textContent ?? null
  button.classList.add('copied')
  if (label) label.textContent = 'Copied'
  setTimeout(() => {
    button.classList.remove('copied')
    if (label && previous !== null) label.textContent = previous
  }, COPY_RESET_MS)
}

function initCopy() {
  document.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-copy]',
    )
    if (!button) return
    const text = resolveCopyText(button)
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
    flashCopied(button)
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Code tabs — switch install / usage panels
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

function initCodeTabs() {
  document.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]')
    if (!tab) return
    const container = tab.closest('.codetabs')
    if (!container) return
    const name = tab.getAttribute('data-tab')
    container.querySelectorAll<HTMLElement>('[data-tab]').forEach((other) => {
      const active = other === tab
      other.classList.toggle('is-active', active)
      other.setAttribute('aria-selected', String(active))
    })
    container.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
      panel.classList.toggle(
        'is-active',
        panel.getAttribute('data-panel') === name,
      )
    })
  })
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Mobile navigation drawer
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

function setDrawer(open: boolean) {
  document.body.classList.toggle('drawer-open', open)
}

function initDrawer() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-drawer-open]')) setDrawer(true)
    if (target.closest('[data-drawer-close]')) setDrawer(false)
    if (
      document.body.classList.contains('drawer-open') &&
      !target.closest('.navdrawer, .sidebar, [data-drawer-open]')
    ) {
      setDrawer(false)
    }
  })
  // Tapping a link navigates away; close so it isn't left open on return.
  document
    .querySelectorAll('.sidebar a, .navdrawer a')
    .forEach((link) => link.addEventListener('click', () => setDrawer(false)))
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Search palette (Pagefind + browse/empty states)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const MAX_RESULTS = 8

interface PagefindDoc {
  url: string
  meta: { title?: string }
  excerpt: string
}
interface PagefindResult {
  data(): Promise<PagefindDoc>
}
interface Pagefind {
  search(query: string): Promise<{ results: PagefindResult[] }>
}

const DOC_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3v5h5"/><path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/></svg>'
const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function initPalette() {
  const scrim = document.querySelector<HTMLElement>('.palette-scrim')
  if (!scrim) return
  const input = scrim.querySelector<HTMLInputElement>('input')
  const browse = scrim.querySelector<HTMLElement>('[data-static]')
  const live = scrim.querySelector<HTMLElement>('[data-live]')
  const empty = scrim.querySelector<HTMLElement>('[data-empty]')
  const emptyQuery = scrim.querySelector<HTMLElement>('[data-empty-query]')

  // undefined = not yet loaded; null = unavailable (e.g. dev, no index built)
  let pagefind: Pagefind | null | undefined

  async function loadPagefind(): Promise<Pagefind | null> {
    if (pagefind !== undefined) return pagefind
    try {
      // Runtime URL so the bundler leaves it alone; the file is generated into
      // the build output by the `pagefind` CLI (absent in dev → caught below).
      const url = `${location.origin}/pagefind/pagefind.js`
      pagefind = await import(/* @vite-ignore */ url)
    } catch {
      pagefind = null
    }
    return pagefind ?? null
  }

  type Mode = 'browse' | 'live' | 'empty'
  function setMode(mode: Mode) {
    if (browse) browse.hidden = mode !== 'browse'
    if (live) live.hidden = mode !== 'live'
    if (empty) empty.hidden = mode !== 'empty'
  }

  function visibleItems(): HTMLElement[] {
    return [...scrim!.querySelectorAll<HTMLElement>('.palette__item')].filter(
      (item) => item.offsetParent !== null,
    )
  }

  function resetActive() {
    scrim!
      .querySelectorAll('.palette__item.active')
      .forEach((item) => item.classList.remove('active'))
  }

  function activateFirst() {
    visibleItems()[0]?.classList.add('active')
  }

  // Dev fallback: filter the browse list by title when Pagefind isn't present.
  function filterBrowse(query: string): boolean {
    const q = query.toLowerCase()
    let any = false
    browse?.querySelectorAll<HTMLElement>('.palette__item').forEach((item) => {
      const hay = (item.getAttribute('data-search') ?? '').toLowerCase()
      const show = !q || hay.includes(q)
      item.style.display = show ? '' : 'none'
      if (show) any = true
    })
    browse
      ?.querySelectorAll<HTMLElement>('.palette__group')
      .forEach((group) => {
        let sibling = group.nextElementSibling as HTMLElement | null
        let visible = false
        while (sibling?.classList.contains('palette__item')) {
          if (sibling.style.display !== 'none') visible = true
          sibling = sibling.nextElementSibling as HTMLElement | null
        }
        group.style.display = visible ? '' : 'none'
      })
    return any
  }

  function renderResults(docs: PagefindDoc[]) {
    if (!live) return
    live.innerHTML = docs
      .map(
        (doc) => `<a class="palette__item" href="${doc.url}">
  <span class="ic">${DOC_ICON}</span>
  <span class="tt"><span class="t">${escapeHtml(doc.meta.title ?? doc.url)}</span><span class="d">${doc.excerpt}</span></span>
  <span class="go">${CHEVRON_ICON}</span>
</a>`,
      )
      .join('')
  }

  function showEmpty(query: string) {
    if (emptyQuery) emptyQuery.textContent = query
    setMode('empty')
  }

  async function search(query: string) {
    const q = query.trim()
    resetActive()
    if (!q) {
      filterBrowse('')
      setMode('browse')
      activateFirst()
      return
    }
    const pf = await loadPagefind()
    if (!pf) {
      const any = filterBrowse(q)
      if (any) {
        setMode('browse')
        activateFirst()
      } else {
        showEmpty(q)
      }
      return
    }
    const found = await pf.search(q)
    const docs = await Promise.all(
      found.results.slice(0, MAX_RESULTS).map((result) => result.data()),
    )
    if (docs.length === 0) {
      showEmpty(q)
      return
    }
    renderResults(docs)
    setMode('live')
    activateFirst()
  }

  function moveActive(delta: number) {
    const items = visibleItems()
    if (items.length === 0) return
    const current = items.findIndex((item) => item.classList.contains('active'))
    const next = (current + delta + items.length) % items.length
    items.forEach((item) => item.classList.remove('active'))
    items[next].classList.add('active')
    items[next].scrollIntoView({ block: 'nearest' })
  }

  function activate() {
    scrim!.querySelector<HTMLAnchorElement>('.palette__item.active')?.click()
  }

  function open() {
    scrim!.classList.add('open')
    if (input) {
      input.value = ''
      setTimeout(() => input.focus({ preventScroll: true }), 30)
    }
    search('')
  }
  function close() {
    scrim!.classList.remove('open')
  }

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-palette-open]')) {
      event.preventDefault()
      open()
    }
    if (target === scrim) close()
  })

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      open()
      return
    }
    if (!scrim!.classList.contains('open')) return
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activate()
    }
  })

  input?.addEventListener('input', () => search(input.value))
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Table-of-contents scroll spy
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

function initScrollSpy() {
  const links = new Map<string, HTMLElement>()
  document.querySelectorAll<HTMLElement>('.toc__link').forEach((link) => {
    const id = link.getAttribute('href')?.slice(1)
    if (id) links.set(id, link)
  })
  if (links.size === 0) return

  const headings = document.querySelectorAll<HTMLElement>(
    '.content h2[id], .content h3[id]',
  )
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        links.forEach((el) => el.classList.remove('toc__link--active'))
        links.get(entry.target.id)?.classList.add('toc__link--active')
      }
    },
    { rootMargin: '-80px 0px -70% 0px' },
  )
  headings.forEach((heading) => observer.observe(heading))
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Init
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export function initDocs() {
  initTheme()
  initCopy()
  initCodeTabs()
  initDrawer()
  initPalette()
  initScrollSpy()
}
