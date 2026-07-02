# Changelog

All notable changes to Wayflow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [0.2.0] - 2026-07-02

### Changed

- **Editor snapshots now carry a `version`** — `EditorSnapshot` is now
  `{ version, graph, viewport? }`, stamped from a single `GRAPH_VERSION` so every
  persisted snapshot records the graph-format version and stays
  forward-compatible. **Breaking:** the snapshot shape changed — a custom
  persistence adapter that builds or reads a snapshot should account for the new
  field. The built-in localStorage adapter handles it automatically.

### Fixed

- **Toolbar zoom readout after wheel/pinch** — the zoom percentage now updates
  after zooming with the mouse wheel or a pinch gesture, not only from the +/-
  buttons. It refreshes once the gesture settles.

## [0.1.2] - 2026-07-02

### Fixed

- **Package resolution under Vite** — the published package no longer exposes a
  `development` export condition pointing at unbundled source, which broke
  `import ... from 'wayflow'` in Vite dev servers ("Failed to resolve import").
  Consumers now resolve to the built `dist` output.

## [0.1.1] - 2026-07-02

### Fixed

- **Structured output for list fields** — an LLM node whose output field is a
  list (`multiple: true`) now emits a valid array JSON schema and is detected as
  structured output. Previously it produced an invalid schema that strict
  providers (OpenAI `json_schema`, the Anthropic-compatible endpoint) rejected.

## [0.1.0] - 2026-07-01

First public release — an embeddable visual workflow editor for the web.

### Added

- **Editor** — `createWorkflowEditor()` mounts a complete workspace (canvas,
  node palette, config panel, and run controls) into any element. Plain
  TypeScript and the DOM, so it works in React, Vue, Svelte, or no framework.
- **Runtime** — an execution engine that runs workflows in the browser or on a
  server (`createRuntime`, `runInBrowser`, run sessions).
- **Built-in nodes** — input, output, LLM, tools, conditional branching, merge,
  map over lists, and image generation.
- **Custom node types** — register your own nodes with ports, a config schema,
  and render/handler logic.
- **Provider-neutral models** — bring-your-own-key LLM and image adapters
  (`createLLMHandler`, `createImageGenerationHandler`, OpenAI-compatible
  providers), with structured output, multi-port routing, and vision input.
- **Human-in-the-loop** — suspend a run for an approval or decision and resume
  it later.
- **Workflows as tools** — expose a whole workflow as a tool an LLM can call.
- **Theming** — brand the entire editor from a single accent token, with light
  and dark kept in sync.
- **Editor modes** — edit, read-only, and preview; mobile and touch support;
  persistence with autosave.
- Full TypeScript types, zero runtime dependencies, and a tree-shakeable
  umbrella package. MIT licensed.

[Unreleased]: https://github.com/TahaSh/wayflow/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/TahaSh/wayflow/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/TahaSh/wayflow/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/TahaSh/wayflow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TahaSh/wayflow/releases/tag/v0.1.0
