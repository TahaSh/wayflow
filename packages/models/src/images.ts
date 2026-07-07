import { createError, ERROR_CODE } from '@wayflow/agent'
import type { ChatContent, ChatContentPart } from './provider'

// Replaces remote http(s) image URLs with base64 data-URIs, for backends that
// accept only base64. Data-URIs and non-image parts pass through untouched.
export const inlineRemoteImages = async (
  content: ChatContent,
  signal: AbortSignal,
): Promise<ChatContent> => {
  if (typeof content === 'string') return content
  return Promise.all(
    content.map(async (part): Promise<ChatContentPart> => {
      if (part.type !== 'image_url' || !isRemote(part.url)) return part
      return { type: 'image_url', url: await toDataUri(part.url, signal) }
    }),
  )
}

// Maps a base64-only backend's "URLs unsupported" rejection to a clear shared
// error; other errors pass through.
export const mapImageUrlError = (err: unknown): unknown => {
  const message = err instanceof Error ? err.message : String(err)
  if (/image url/i.test(message) && /base64/i.test(message)) {
    return createError(ERROR_CODE.LLM_IMAGE_URL_UNSUPPORTED)
  }
  return err
}

const isRemote = (url: string): boolean => /^https?:\/\//i.test(url)

const toDataUri = async (url: string, signal: AbortSignal): Promise<string> => {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw createError(ERROR_CODE.RUNTIME_HTTP_ERROR, {
      status: res.status,
      detail: `fetching image ${url}`,
    })
  }
  const mediaType = res.headers.get('content-type') || 'image/png'
  const data = arrayBufferToBase64(await res.arrayBuffer())
  return `data:${mediaType};base64,${data}`
}

// Buffer isn't available in browsers, so this isomorphic image path falls
// back to btoa there instead of assuming a Node runtime.
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  if (typeof Buffer !== 'undefined')
    return Buffer.from(buffer).toString('base64')
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
