# Contributing to Wayflow

Thanks for your interest in improving Wayflow! There are many ways to help, and
not all of them involve writing code. This guide gets you set up and explains
what we look for in a contribution.

The authoritative reference for project structure and coding conventions is
[AGENTS.md](AGENTS.md) — this file is the short version.

## Ways to contribute

- **Report bugs** — open an issue with a minimal reproduction. A good bug report
  is one of the most valuable contributions there is.
- **Improve the docs** — fixes, clarifications, and examples are always welcome.
  The docs live in this repo under `docs/`.
- **Build an example** — a focused app under `examples/` that shows a real use
  case helps everyone.
- **Join the discussion** — answering questions and weighing in on proposals is
  real, undervalued work.
- **Send a pull request** — see below.

## Before you start

**Open an issue first.** Before writing code for a new feature or a non-trivial
change, open an issue (or comment on an existing one) so we can agree on the
approach. This avoids wasted effort — someone may already be working on it, or
there may be a reason it wasn't built. Small, obvious fixes (typos, clear bugs)
can go straight to a pull request.

## Getting started

```sh
pnpm install
pnpm build      # build all packages to dist/ (also typechecks via --dts)
```

Commands you'll use while developing:

- `pnpm test` — run the Vitest suite (`pnpm test:watch` for watch mode)
- `pnpm check` — Biome format + lint check (`pnpm check:write` to autofix)
- `pnpm typecheck:tests` — typecheck the `tests/` tree
- `npx tsc -b packages/<pkg>` — fast typecheck of a single package

To experiment, run one of the apps under `examples/` (`quickstart`,
`custom-nodes`, `low-level`, `with-backend`). The `dom` and `ui` packages have no
unit tests yet, so changes to them are best verified by running an example.

## Pull requests

- **Features** — should reference the issue where the approach was agreed, and
  include tests where the package has a test suite (`core`, `agent`, `runtime`).
- **Bug fixes** — reference the issue they fix in the PR description.
- **Chores** — dependency bumps, tooling, and docs are welcome on their own.

Please avoid purely stylistic refactors — Biome already enforces formatting and
lint, so reshuffling code without a behavior or clarity change is hard to review.
Performance improvements are welcome (a benchmark or before/after helps).

Before opening a PR, make sure these all pass — they're exactly what CI runs:

```sh
pnpm check      # format + lint
pnpm build      # build + typecheck
pnpm test       # unit tests
```

## Documentation

The docs site lives in this repo under `docs/`. Keeping docs in the same repo
means an API change and its documentation can land in a single pull request —
please update the relevant docs whenever you change public behavior.

## Coding conventions

All conventions live in [AGENTS.md](AGENTS.md) — Biome formatting (no semicolons,
single quotes, 2-space indent, 80-col), the `createX(params)` factory pattern,
naming rules, and the package layer boundaries. Please skim it before your first
PR; when in doubt, follow the surrounding code.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers this project.
