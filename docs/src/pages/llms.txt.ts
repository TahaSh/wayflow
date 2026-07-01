// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  llms.txt — machine-readable docs index (llmstxt.org)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'
import { hrefFor } from '@/lib/navigation'
import { SIDEBAR } from '@/lib/sidebar'

const SUMMARY = 'An embeddable visual workflow editor for the web.'

export const GET: APIRoute = async ({ site }) => {
  const docs = await getCollection('docs')
  const descriptions = new Map(
    docs.map((doc) => [doc.id, doc.data.description]),
  )
  const base = site?.href.replace(/\/$/, '') ?? ''

  const lines = ['# Wayflow', '', `> ${SUMMARY}`, '']
  for (const section of SIDEBAR) {
    lines.push(`## ${section.title}`, '')
    for (const item of section.items) {
      const description = descriptions.get(item.slug)
      const suffix = description ? `: ${description}` : ''
      lines.push(`- [${item.title}](${base}${hrefFor(item.slug)})${suffix}`)
    }
    lines.push('')
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
