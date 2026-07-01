# Low-level

Drop the `WorkflowEditor` shell and drive the `@wayflow/dom` canvas directly —
no sidebar, no config panel, your own toolbar.

```sh
pnpm dev    # first time? see ../README.md for setup
```

## What's here

`main.ts` uses `createEditor(...)` from `@wayflow/dom`: a custom interactive
**Counter** node (− / + buttons that write to node data via `updateData`), a
**Display** node that mirrors it through the `dataChange` event, a hand-built
Import/Export toolbar, and a seeded graph.

## Make it yours

This is the layer beneath `createWorkflowEditor` — reach for it when you need
full control of the surrounding UI. For the batteries-included editor, see
[quickstart](../quickstart).
