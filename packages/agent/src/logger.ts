// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Log levels
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL]

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Logger
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A structured diagnostics sink: each level takes a human-readable message and a
// bag of structured fields (runId, nodeId, …). Provide your own to route logs
// wherever you collect them.
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export interface ConsoleLoggerOptions {
  // The lowest level to emit; quieter levels are dropped. Defaults to the most
  // verbose so the full trace shows.
  level?: LogLevel
}

const LOG_PREFIX = '[wayflow]'

// The console is a universal global, but this package's lib is environment-
// neutral and doesn't declare its type. Declare only what's used.
declare const console: Record<LogLevel, (line: string) => void>

// Writes to the console with no ANSI, so the output reads the same when piped or
// redirected. Fields render as ` key=value` after the message.
export const createConsoleLogger = ({
  level = LOG_LEVEL.DEBUG,
}: ConsoleLoggerOptions = {}): Logger => {
  const threshold = LEVEL_ORDER[level]
  const at =
    (logLevel: LogLevel, write: (line: string) => void) =>
    (message: string, fields?: Record<string, unknown>) => {
      if (LEVEL_ORDER[logLevel] < threshold) return
      const tag = logLevel.toUpperCase().padEnd(5)
      write(`${LOG_PREFIX} ${tag} ${message}${formatFields(fields)}`)
    }
  return {
    debug: at(LOG_LEVEL.DEBUG, console.debug),
    info: at(LOG_LEVEL.INFO, console.info),
    warn: at(LOG_LEVEL.WARN, console.warn),
    error: at(LOG_LEVEL.ERROR, console.error),
  }
}

const formatFields = (fields?: Record<string, unknown>): string => {
  if (!fields) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    parts.push(`${key}=${formatValue(value)}`)
  }
  return parts.length ? ` ${parts.join(' ')}` : ''
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
