// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Snake case
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const toSnakeCase = (input: string | undefined): string | undefined => {
  if (!input) return undefined
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || undefined
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Duration
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Pluralize
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const pluralize = (count: number, singular: string): string => {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}
