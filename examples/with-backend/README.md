# With backend

Embed the editor and wire it to a real backend that executes graphs — model
list, streaming runs, cancellation, and persistence, all over HTTP.

## Prerequisites

An OpenAI-compatible endpoint for chat and image generation. The quickest is
[Ollama](https://ollama.com) (free, local, no API key):

```sh
ollama pull qwen3.5:9b
ollama pull x/flux2-klein:latest   # for the Image Generation node
```

Prefer a hosted provider? See **Make it yours** — no Ollama needed.

## Run

```sh
pnpm dev    # first time? see ../README.md for setup
```

Starts the server on `:3001` and the editor on `:5173`.

## What's here

- `server/runtime.ts` — wire any OpenAI-compatible client to the runtime.
- `server/index.ts` — a small Hono server: the model list, a streaming
  `/api/run`, and workflow persistence (kept in memory).
- `src/main.ts` — embed the editor and connect it to the backend.
- `src/example-workflow.ts` — the seeded **Support Ticket Triage** graph: a list
  input, an LLM that runs once per item, Merge `zip`, and Array Operations.

## Make it yours

- **Hosted provider:** in `server/runtime.ts`, swap the client for
  `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`, set `MODEL` to a hosted
  id (e.g. `gpt-5.4-mini`), and update the matching model id in
  `src/example-workflow.ts`.
- **Persistence:** the workflow autosaves to the server's in-memory store
  (survives reloads, resets on restart) — swap it for your database.
- **Markdown:** `renderMarkdown` accepts any parser; this uses `marked`.
- **Any server framework:** `streamResponse` returns a standard Fetch
  `Response`. For Node-style `req/res` (Express, etc.), use `writeSSE`.
```
