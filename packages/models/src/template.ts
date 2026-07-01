import { createError, ERROR_CODE } from '@wayflow/agent'
import type { Node } from '@wayflow/core'
import type { ChatContent, ChatContentPart } from './provider'

// Substitutes `{varName}` tokens in `template` with values from `vars`.
// Missing keys throw — callers should resolve defaults before calling.
export const fillTemplate = (
  template: string,
  vars: Record<string, unknown>,
): string => {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) {
      throw createError(ERROR_CODE.TEMPLATE_VAR_MISSING, { name })
    }
    return stringify(vars[name])
  })
}

export const buildMessages = (
  node: Node,
  inputs: Record<string, unknown>,
): { system: string; user: ChatContent } => {
  const prompt = String(node.data.prompt ?? '')
  const systemPrompt = String(node.data.systemPrompt ?? '')
  const vars = mergeVariableDefaults(node, inputs)
  const imageVars = imageVarNames(node)
  return {
    // Images belong only in the user message, so the system prompt keeps text.
    system: flattenText(buildContent(systemPrompt, vars, imageVars)),
    user: buildContent(prompt, vars, imageVars),
  }
}

// Fills the template, placing an image part where an image-typed var is
// referenced; returns a plain string when no image parts result.
const buildContent = (
  template: string,
  vars: Record<string, unknown>,
  imageVars: Set<string>,
): ChatContent => {
  const parts: ChatContentPart[] = []
  let text = ''
  let cursor = 0
  let hasImage = false

  const flushText = () => {
    if (text) parts.push({ type: 'text', text })
    text = ''
  }

  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const name = match[1]
    const at = match.index ?? 0
    text += template.slice(cursor, at)
    cursor = at + match[0].length

    if (!(name in vars)) {
      throw createError(ERROR_CODE.TEMPLATE_VAR_MISSING, { name })
    }
    const value = vars[name]
    if (imageVars.has(name) && typeof value === 'string' && value) {
      flushText()
      parts.push({ type: 'image_url', url: value })
      hasImage = true
    } else {
      text += stringify(value)
    }
  }
  text += template.slice(cursor)
  flushText()

  return hasImage ? parts : flattenText(parts)
}

const flattenText = (content: ChatContent): string =>
  typeof content === 'string'
    ? content
    : content.map((p) => (p.type === 'text' ? p.text : '')).join('')

const stringify = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return stringifyList(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// A list of primitives renders as a numbered list; a list of objects as JSON.
const stringifyList = (items: unknown[]): string => {
  const allPrimitive = items.every(
    (it) => it === null || typeof it !== 'object',
  )
  if (!allPrimitive) return JSON.stringify(items)
  return items.map((it, i) => `${i + 1}. ${stringify(it)}`).join('\n')
}

const imageVarNames = (node: Node): Set<string> => {
  const rows =
    (node.data.variableDefaults as
      | { name: string; dataType?: string }[]
      | undefined) ?? []
  return new Set(rows.filter((r) => r.dataType === 'image').map((r) => r.name))
}

// Connected port wins; an unconnected port — or one carrying an empty value —
// falls back to the matching `variableDefaults` row.
export const mergeVariableDefaults = (
  node: Node,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  const defaultsList =
    (node.data.variableDefaults as
      | { name: string; default?: unknown }[]
      | undefined) ?? []
  const out: Record<string, unknown> = {}
  for (const row of defaultsList) {
    if (row.default !== undefined) out[row.name] = row.default
  }
  for (const [k, v] of Object.entries(inputs)) {
    if (v !== undefined && v !== '') out[k] = v
  }
  return out
}
