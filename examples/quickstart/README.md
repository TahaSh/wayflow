# Quickstart

The whole Wayflow editor in one call — canvas, node palette, config panel, and
run controls.

```sh
pnpm dev    # first time? see ../README.md for setup
```

## What's here

`main.ts` is a single `createWorkflowEditor(...)`, and `example-workflow.ts`
seeds a small Input → LLM → Output graph so the canvas opens with something to
explore. The graph autosaves to localStorage; the model names are labels the
palette offers. There's no backend, so it's a design surface — nothing executes.

## Make it yours

- Swap the `models` for the ones you use.
- To actually run graphs, see [with-backend](../with-backend).
