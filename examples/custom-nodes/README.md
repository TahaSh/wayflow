# Custom nodes

Add your own node type — ports, config, a custom icon, and interactive content
rendered inside the node.

```sh
pnpm dev    # first time? see ../README.md for setup
```

## What's here

`main.ts`, in three steps:

1. Define an **HTTP Request** node type (ports + config).
2. Register it and render a live method badge + URL field that stays in sync
   with the config panel.
3. Give it a custom icon via the `icons` option, and seed a small graph.

This is the **editor** side — how the node looks and configures. It doesn't run
on its own: to make the node *do* something when the graph executes, register a
handler for its `http` type in the runtime, where the actual `fetch` would
live. See [with-backend](../with-backend) for the runtime + handler pattern.

## Make it yours

- Change the ports and `configSchema` on the `NodeTypeDefinition`.
- Register your own icon under `icons` — 24×24 stroke SVG inner paths, merged
  over the built-ins (no need to touch the library).
- The node renderer is plain DOM; build whatever you want inside the node.
