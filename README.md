# openbench-local

[![CI](https://github.com/zeljan-alduk/openbench-local/actions/workflows/ci.yml/badge.svg)](https://github.com/zeljan-alduk/openbench-local/actions/workflows/ci.yml)
[![Pages](https://github.com/zeljan-alduk/openbench-local/actions/workflows/pages.yml/badge.svg)](https://github.com/zeljan-alduk/openbench-local/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Discover and benchmark every local LLM on your machine, in seconds, from your browser.
> 100% client-side. No signup. Nothing leaves localhost.

## Live demo

| Surface | URL |
| --- | --- |
| Hosted on aldo.tech (canonical) | <https://ai.aldo.tech/opensource/openbench-local/> |
| GitHub Pages (mirror) | <https://zeljan-alduk.github.io/openbench-local/> |

Both URLs serve the same `main`-branch build. The `aldo.tech` host
is the canonical surface — it proxies the GitHub Pages content
through a Next.js Route Handler that injects the right `<base>` so
relative asset paths resolve cleanly.

### Per-PR preview deploys

Every pull request opened against `main` gets its own ephemeral
preview that updates on every push to the branch and is removed
when the PR closes:

| Surface | URL pattern |
| --- | --- |
| aldo.tech | `https://ai.aldo.tech/opensource/openbench-local/pr-<N>/` |
| GitHub Pages | `https://zeljan-alduk.github.io/openbench-local/pr-<N>/` |

A sticky comment on each PR carries both URLs and the commit SHA the
preview was built from. Reviewers click through, exercise the build
in their browser, and request changes the same way they would with a
managed host (Vercel / Netlify / Cloudflare Pages). The mechanics
are described in [CI / CD](#ci--cd) below.

`openbench-local` is a single-page app that:

1. **Probes `127.0.0.1`** for any OpenAI-compatible LLM server — Ollama,
   LM Studio, vLLM, llama.cpp, and any custom host you add.
2. **Runs an 18-case eval suite** against every model you select —
   instruction-following, JSON output, code reasoning, retrieval, native
   tool calls, and vision (counting, OCR, spatial). Cases auto-skip on
   models that lack the required capability.
3. **Streams results live** as each case finishes, with pass-rate, mean
   tok/s, and p95 latency per model, plus a side-by-side comparison
   when you pick more than one.
4. **Exports everything** — interactive HTML (collapsible, printable,
   single self-contained file), Markdown, JSON, or print-to-PDF.

There is no backend. The browser talks to `127.0.0.1` directly. Your
prompts, your model output, your timings — none of it ever leaves your
machine.

## Quickstart

```bash
git clone https://github.com/zeljan-alduk/openbench-local.git
cd openbench-local
pnpm install
pnpm dev
```

Open http://localhost:5173.

### Docker

Prefer not to install Node? Build the image and run nginx:

```bash
docker build -t openbench-local .
docker run --rm -p 8080:80 openbench-local
```

Open http://localhost:8080. The container only serves the static
bundle — your browser does *all* LLM traffic itself, directly to the
host's `127.0.0.1`, so no `--network=host` flag or `host.docker.internal`
plumbing is required.

The published image `ghcr.io/zeljan-alduk/openbench-local:latest` is
built and pushed by CI on every merge to `main` (planned).

Then start at least one local LLM server:

| Engine     | Default port | One-line start                                |
| ---------- | ------------ | --------------------------------------------- |
| Ollama     | 11434        | `ollama serve` (started by the desktop app)   |
| LM Studio  | 1234         | "Local Server" tab → Start Server             |
| vLLM       | 8000         | `vllm serve <model>`                          |
| llama.cpp  | 8080         | `llama-server -m <gguf>`                      |

The page auto-discovers each one. The first model is auto-selected; tap
more cards to compare side-by-side.

## Browser permissions — read this first

Browsers intentionally restrict an HTTPS page from talking to local
servers. Whether openbench-local works out of the box depends on four
things, none of which are about the app itself:

1. **Mixed content** — can the HTTPS page reach `http://...`?
2. **CORS** — does the LLM server allow this origin?
3. **Private Network Access (PNA)** — does Chrome require an extra
   preflight for private-IP fetches? (yes, since v117)
4. **Browser-level toggles** — flags / shields / Develop-menu
   options.

The page surfaces an inline panel with copy-pasteable per-engine CORS
config (`OLLAMA_ORIGINS`, LM Studio's CORS toggle, vLLM
`--allowed-origins`, llama.cpp `--cors`) when probes fail.

For step-by-step manual instructions per browser (Chrome / Edge /
Brave, Firefox, Safari, mobile), including PNA flags, Brave Shields,
and Safari's mixed-content workaround, see
**[`docs/browser-permissions.md`](docs/browser-permissions.md)**.

The simplest path that sidesteps most of this is to run the page over
plain HTTP loopback yourself — `pnpm dev` → `http://localhost:5173`.
Mixed content evaporates and PNA does not apply.

## How the eval suite works

The 18 cases are inlined in
[`src/components/local-models/builtin-suite.ts`](src/components/local-models/builtin-suite.ts).
Each case has:

- a prompt (and optional vision image, base64-encoded inline),
- an expected-shape evaluator (substring match, regex, JSON schema, or
  expected tool-call name + args),
- a capability gate (`tool_use`, `vision`) that lets it auto-skip on
  unsupported models so the pass-rate denominator stays honest.

Scoring is computed in the browser by
[`evaluator-direct.ts`](src/components/local-models/evaluator-direct.ts) — no
LLM-as-judge, no network round-trip, deterministic.

## Generation parameters

The "Setup" panel (between Discover and Run) sets a global generation
profile: `temperature`, `top_p`, `max_tokens`, `seed`,
`reasoning_effort`, optional warm-up call, and a system prompt. Toggle
it off to use each engine's defaults.

Per-model overrides are available too — gear icon on a model card.
Precedence: global panel wins for any field it sets, per-model overrides
fill in the rest.

## Custom eval cases

Click **Eval cases** in the panel between Setup and Run. From there you
can:

- **Edit any built-in case** — change the prompt, evaluator, weight,
  or tags. Edits are stored in your browser only.
- **Hide cases you don't care about** — the runner skips them entirely.
- **Add your own custom cases** — same shape as the built-ins. Five
  evaluator kinds are available in the form: `contains`,
  `not_contains`, `regex`, `exact`, `json_schema`. Tool-call evaluators
  and image attachments are preserved on round-trip but only authorable
  via YAML.
- **Export everything to YAML** — share your suite with a teammate, or
  back it up.
- **Import YAML** — drop in a `.yaml` file with a list of cases (our
  wrapper shape, a bare list, or a `{ suite: { cases } }` block all
  work).
- **Reset all** — restores the 18 built-in defaults.

State lives in `localStorage` under `openbench-local:cases`. Nothing is
uploaded.

## Build for production

```bash
pnpm build
```

Outputs static files to `dist/`. Deploy anywhere — GitHub Pages,
Netlify, Cloudflare Pages, S3, or just `npx serve dist`.

`vite.config.ts` sets `base: './'` so the build is portable to any
sub-path on a parent domain.

## CI / CD

Two GitHub Actions workflows handle the development cycle:

- **`.github/workflows/ci.yml`** — typecheck + production build on every
  push and pull request. Uploads `dist/` as a workflow artifact.
- **`.github/workflows/pages.yml`** — deploys to GitHub Pages.
  - `push` to `main` → `gh-pages/` root → served at
    `https://zeljan-alduk.github.io/openbench-local/`.
  - `pull_request` → `gh-pages/pr-<N>/` → served at
    `https://zeljan-alduk.github.io/openbench-local/pr-<N>/`.

  A sticky comment on the PR carries both URLs and refreshes on every
  push to the branch.

- **`.github/workflows/pr-cleanup.yml`** — when a PR closes (merged or
  not), removes the `pr-<N>/` folder from `gh-pages` so previews don't
  accumulate.

### How the dev cycle looks in practice

```
git checkout -b feat/new-eval-case
# edit files…
git push -u origin feat/new-eval-case
gh pr create --fill
```

CI runs typecheck + build. If it passes, the Pages workflow publishes
a preview at `https://zeljan-alduk.github.io/openbench-local/pr-<N>/`
and posts a comment on the PR. Reviewers click through, exercise the
build, and request changes. On merge, production updates; on close,
the preview folder is deleted.

This pattern — per-PR preview URL, sticky comment, auto-cleanup — is
the standard frontend OSS dev cycle. Managed services like Vercel,
Netlify, and Cloudflare Pages do it natively; we get the same
ergonomics out of plain GitHub Pages.

### One-time repo setup

After cloning, enable GitHub Pages in the repo settings:

1. **Settings → Pages → Source** — pick "Deploy from a branch".
2. **Branch** — `gh-pages` (it'll appear after the first deploy lands).
3. The site auto-publishes on every push to `main`.

## Project structure

```
openbench-local/
├── index.html
├── public/
│   └── favicon.svg
├── src/
│   ├── App.tsx                     # page shell + hero copy
│   ├── main.tsx                    # React entry point
│   ├── index.css                   # design tokens + tailwind directives
│   └── components/
│       └── local-models/
│           ├── local-models-shell.tsx     # top-level interactive island
│           ├── bench-direct.ts            # streaming /chat/completions client
│           ├── discovery-direct.ts        # localhost port probing
│           ├── evaluator-direct.ts        # browser-side scoring
│           ├── builtin-suite.ts           # the 18 inlined eval cases
│           ├── vision-fixtures.ts         # base64 PNG images for vision cases
│           ├── capabilities.ts            # per-model capability inference
│           ├── cors-recipes.ts            # per-engine CORS config snippets
│           ├── report-export.ts           # md / json / interactive html
│           ├── per-model-config.ts        # override storage (localStorage)
│           ├── selection.ts               # canonical model key
│           └── *.tsx                      # UI components
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

The eval suite is intentionally inlined as data — adding a case is a
TypeScript edit in `builtin-suite.ts`, no harness rewiring required.

## License

MIT — see [LICENSE](LICENSE).
