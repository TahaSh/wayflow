# Preview Mode

A read-only presentation of a workflow — for embedding a graph in a page rather
than editing it.

```sh
pnpm dev    # first time? see ../README.md for setup
```

## What's here

`main.ts` calls `createWorkflowEditor(..., { mode: 'preview' })`, and
`example-workflow.ts` seeds a small Input → LLM → Output graph. Preview drops
the palette and structural editing, keeps pan / zoom / pinch, and shows a
minimal shell with a footer and header zoom controls. Tapping a node slides in
its Result — from the right on desktop, the bottom on a phone. Open this on a
mobile device to try the touch interactions.

The `preview` options also turn on a theme toggle and a bring-your-own-key
button: enter a key and it flips to an accent "Your key" state (persisted to
`localStorage`), the shape a public embed uses so each visitor runs with their
own key. The mock provider ignores it — point `onSubmit` at a real provider to
actually run with the entered key.

## Make it yours

- Switch `mode` to `'edit'` for the full authoring editor, or `'read-only'` for
  the editor chrome without any editing.
- Customize `preview.footer` (caption + end text), or wire the key button's
  `onSubmit` into a real provider so the entered key actually runs.
- Swap the seeded graph in `example-workflow.ts` for your own.
