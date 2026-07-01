// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Navigation — derived helpers over the sidebar tree
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

import { SIDEBAR, type SidebarLink } from './sidebar'

const FLAT: SidebarLink[] = SIDEBAR.flatMap((section) => section.items)

export interface Pager {
  prev?: SidebarLink
  next?: SidebarLink
}

export function getPager(slug: string): Pager {
  const index = FLAT.findIndex((item) => item.slug === slug)
  if (index === -1) return {}
  return {
    prev: index > 0 ? FLAT[index - 1] : undefined,
    next: index < FLAT.length - 1 ? FLAT[index + 1] : undefined,
  }
}

export function hrefFor(slug: string): string {
  return `/docs/${slug}`
}

export function isActive(currentPath: string, slug: string): boolean {
  return currentPath.replace(/\/$/, '') === hrefFor(slug)
}

export function getSectionTitle(slug: string): string | undefined {
  return SIDEBAR.find((section) =>
    section.items.some((item) => item.slug === slug),
  )?.title
}
