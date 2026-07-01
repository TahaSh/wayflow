# Wayflow examples

Four standalone apps, smallest to largest:

| Example | What it shows |
| --- | --- |
| [quickstart](./quickstart) | The whole editor in one call |
| [custom-nodes](./custom-nodes) | Add your own node type, renderer, and icon |
| [low-level](./low-level) | Drive the `@wayflow/dom` canvas directly, no shell |
| [with-backend](./with-backend) | Wire the editor to a server that runs graphs |

These are a self-contained workspace with their own dependencies — none of them
leak into the library's own (zero) dependencies.

## First-time setup

The examples link the local Wayflow packages from source, so install the repo
root first, then the examples:

```sh
pnpm install                  # from the repo root — links the local packages
cd examples && pnpm install
```

Then run any example:

```sh
cd quickstart && pnpm dev
```

Edits to the library source hot-reload into a running example — no rebuild.
