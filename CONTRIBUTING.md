# Contributing

Thanks for your interest in `openbench-local`. This is a small, focused
project — bug reports, eval cases, and engine support patches are all
welcome.

## Local setup

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # strict TS, no emit
pnpm test         # vitest unit suite (evaluator, case generation, stats)
pnpm build        # production build → dist/
```

Node 20+ recommended (CI runs Node 24).

Tests are colocated (`src/**/*.test.ts`, plain node environment) and
import from `vitest` explicitly. The deterministic scoring core —
`evaluator-direct.ts`, `case-generate.ts`, `cases-yaml.ts`,
`capabilities.ts` — is pure TypeScript; changes there need matching
golden tests, since a silent scoring bug corrupts every stored result.

## Project shape

The app is a single Vite + React + TypeScript SPA. Everything ships to
the browser; there is no server-side code. Any file under
`src/components/local-models/` is fair game — most files are
self-contained and document their own contract in the file header.

## Adding an eval case

Open `src/components/local-models/builtin-suite.ts` and append to the
`cases` array. Each case takes a prompt, an evaluator (one of
`contains` | `regex` | `json_schema` | `tool_call`), and an optional
capability gate (`tool_use`, `vision`). See existing cases for the
shape.

Cases are deterministic and run by `evaluator-direct.ts` — no
LLM-as-judge, no network calls beyond the model under test.

## Adding a new engine / runtime

The discovery flow lives in `discovery-direct.ts`. To add support:

1. Add the default port and a name to the source list.
2. Add a probe entry that hits the OpenAI-compatible
   `/v1/models` (or equivalent) endpoint.
3. Add a CORS recipe in `cors-recipes.ts`.
4. Add an engine-setup tip in `engine-setup-tips.tsx`.

If the engine speaks something other than the OpenAI Chat Completions
shape, you'll also need a small adapter in `bench-direct.ts`. Most
local engines speak OpenAI-compat out of the box.

## Pull requests

- One change per PR — easier to review, easier to revert.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening.
- For UI changes, attach a screenshot or short clip.

## Reporting bugs

Open a GitHub issue with:

- Engine + version (e.g. Ollama 0.4.7)
- Model id (e.g. `qwen2.5-coder:7b-instruct`)
- Browser + OS
- A copy of the JSON export if the bug is in scoring (helps reproduce)

Network logs from DevTools are gold for CORS / discovery issues.
