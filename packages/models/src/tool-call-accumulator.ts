import type { ChatToolCall } from './provider'

// Streaming chat APIs fragment tool-call info across many chunks keyed by index.
// This collects the pieces and emits whole calls on finalize().

export class ToolCallAccumulator {
  private acc = new Map<
    number,
    { id: string; name: string; argsJson: string }
  >()

  delta(
    index: number,
    partial: { id?: string; name?: string; args?: string },
  ): void {
    const entry = this.acc.get(index) ?? { id: '', name: '', argsJson: '' }
    if (partial.id) entry.id = partial.id
    if (partial.name) entry.name = partial.name
    if (partial.args) entry.argsJson += partial.args
    this.acc.set(index, entry)
  }

  *finalize(): IterableIterator<ChatToolCall> {
    for (const { id, name, argsJson } of this.acc.values()) {
      if (!argsJson) {
        yield { id, name, args: {} }
        continue
      }
      try {
        yield { id, name, args: JSON.parse(argsJson) }
      } catch (err) {
        yield {
          id,
          name,
          args: {},
          argsParseError: err instanceof Error ? err.message : String(err),
        }
      }
    }
  }
}
