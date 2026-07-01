# Changelog

All notable changes to Wayflow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

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

[Unreleased]: https://github.com/TahaSh/wayflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TahaSh/wayflow/releases/tag/v0.1.0
