# openbench-local

[![CI](https://github.com/zeljan-alduk/openbench-local/actions/workflows/ci.yml/badge.svg)](https://github.com/zeljan-alduk/openbench-local/actions/workflows/ci.yml)
[![Pages](https://github.com/zeljan-alduk/openbench-local/actions/workflows/pages.yml/badge.svg)](https://github.com/zeljan-alduk/openbench-local/actions/workflows/pages.yml)
[![Container](https://github.com/zeljan-alduk/openbench-local/actions/workflows/container.yml/badge.svg)](https://github.com/zeljan-alduk/openbench-local/actions/workflows/container.yml)
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

Pick whichever fits — all three serve the exact same SPA.

**Pull the published Docker image** (multi-arch `linux/amd64` +
`linux/arm64`, rebuilt on every merge to `main`):

```bash
docker run --rm -p 8080:80 ghcr.io/zeljan-alduk/openbench-local:latest
# or:  docker compose up -d
```

→ open <http://localhost:8080>

**Run from source with Node**:

```bash
git clone https://github.com/zeljan-alduk/openbench-local.git
cd openbench-local
pnpm install
pnpm dev
```

→ open <http://localhost:5173>

**Build the Docker image from source** (no Node on the host):

```bash
docker build -t openbench-local .
docker run --rm -p 8080:80 openbench-local
```

The container only serves the static bundle — your browser does *all*
LLM traffic itself, directly to the host's `127.0.0.1`, so no
`--network=host` or `host.docker.internal` plumbing is required.

Image tags published to `ghcr.io/zeljan-alduk/openbench-local`:

| Tag | Source |
| --- | --- |
| `latest`        | tip of `main` |
| `main`          | tip of `main` (alias) |
| `sha-<short>`   | every push to `main` |
| `v1.2.3`, `1.2`, `1` | git tag `v1.2.3` |

## Local LLM engines

Start at least one of these alongside the SPA. The page
auto-discovers them on default ports:

| Engine     | Default port | One-line start                                |
| ---------- | ------------ | --------------------------------------------- |
| Ollama     | 11434        | `ollama serve` (started by the desktop app)   |
| LM Studio  | 1234         | "Local Server" tab → Start Server             |
| vLLM       | 8000         | `vllm serve <model>`                          |
| llama.cpp  | 8080         | `llama-server -m <gguf>`                      |

The first discovered model is auto-selected; click more cards to
compare side-by-side.

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

## Editable eval suite

Click **Eval cases** in the panel between Setup and Run. The panel is
a full case-editor:

- **Search / filter** by id, tag, evaluator kind, or prompt body.
- **Enable / disable** any case via a toggle switch — disabled rows
  stay visible but are skipped at run time.
- **Bulk enable / disable visible** — operates on whatever the search
  matches, or the whole suite when no filter is set.
- **Drag-and-drop reorder** — runtime sequence persists across reloads.
- **Edit any built-in or custom case** in a side-by-side editor with
  a live row preview and a "Try it" sandbox that scores a pasted
  sample output through the evaluator in real time.
- **Duplicate** any case — mints a unique id and opens the editor on
  the copy so you can tweak before saving.
- **Six evaluator kinds, all authorable in the form**: `contains`,
  `not_contains`, `regex`, `exact`, `json_schema`, `tool_call`
  (function name + optional args schema). The `tools` array (function
  specs offered to the model) lives in a collapsible "Tools spec
  (advanced)" section.
- **Image + text/code attachments** via a file picker:
  - Image (`png` / `jpeg` / `webp` / `gif`, up to 2 MB) → wired to the
    chat-completion request as the OpenAI vision `image_url` content
    part. Setting an attachment auto-flips the case's `vision`
    capability gate.
  - Text-like file (`.txt`, `.md`, `.json`, `.yaml`, `.csv`, code
    extensions, up to 200 KB) → contents appended to the prompt
    textarea under a `=== filename ===` fence so you can edit before
    saving.
  - Binary docs (`.pdf` / `.docx` / `.xlsx` / `.mp3` / `.mp4` / etc.)
    → explicit refusal with an "extract text first" hint, since local
    chat-completion APIs don't accept those bytes.
- **Reset** any built-in to its default; **Delete** any custom; or
  **Reset all** to roll back the entire suite to the shipped 18 cases.
- **Export YAML** — every case in the user's order. **Import YAML** —
  accepts the wrapper shape, a bare list, or a `{ suite: { cases } }`
  block.

State lives in `localStorage` under `openbench-local:cases`. Image
data URLs count against the browser's ~5–10 MB origin quota; the
2 MB-per-image cap and 200 KB-per-text cap are deliberately
conservative for that reason. Nothing is uploaded.

## Theme

Top-right pill toggles between **light**, **system** (follows
`prefers-color-scheme`), and **dark**. Choice is persisted to
`localStorage` under `openbench-local:theme`; an inline pre-paint
script in `index.html` applies the saved class to `<html>` before
React mounts so the page paints with the right colours on the first
frame (no flash-of-wrong-theme).

## Build for production

```bash
pnpm build
```

Outputs static files to `dist/`. Deploy anywhere — GitHub Pages,
Netlify, Cloudflare Pages, S3, or just `npx serve dist`.

`vite.config.ts` sets `base: './'` so the build is portable to any
sub-path on a parent domain.

## CI / CD

Four GitHub Actions workflows handle the development cycle:

| Workflow | Trigger | Output |
| --- | --- | --- |
| **`ci.yml`** | every push / PR | typecheck + production build, uploads `dist/` artifact |
| **`pages.yml`** | `main` & PRs | publishes to GitHub Pages — `gh-pages/` root for prod, `gh-pages/pr-<N>/` for previews |
| **`pr-cleanup.yml`** | PR closed | removes the matching `pr-<N>/` folder so previews don't accumulate |
| **`container.yml`** | `main` & `v*` tags | multi-arch (`amd64` + `arm64`) container image to `ghcr.io/zeljan-alduk/openbench-local` |

A sticky comment on each PR carries the GitHub Pages preview URL plus
the proxied `ai.aldo.tech/opensource/openbench-local/pr-<N>/` URL,
refreshes on every push, and updates to "Preview removed" on close.

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
├── index.html                              # SPA entry + pre-paint theme script
├── Dockerfile                              # node:22-alpine build → nginx:1.27-alpine serve
├── docker-compose.yml                      # one-liner self-host
├── public/
│   └── favicon.svg
├── src/
│   ├── App.tsx                             # page shell + hero copy
│   ├── main.tsx                            # React entry point
│   ├── index.css                           # design tokens + tailwind directives
│   └── components/
│       ├── theme-toggle.tsx                # light / system / dark
│       ├── storage-notice.tsx              # GDPR/ePrivacy disclosure
│       └── local-models/
│           ├── local-models-shell.tsx      # top-level interactive island
│           ├── bench-direct.ts             # streaming /chat/completions client
│           ├── discovery-direct.ts         # localhost port probing
│           ├── evaluator-direct.ts         # browser-side scoring
│           ├── builtin-suite.ts            # the 18 inlined eval cases
│           ├── vision-fixtures.ts          # base64 PNG images for vision cases
│           ├── capabilities.ts             # per-model capability inference
│           ├── cors-recipes.ts             # per-engine CORS config snippets
│           ├── report-export.ts            # md / json / interactive html
│           ├── case-store.ts               # editable suite — overrides, disabled, order
│           ├── case-edit-modal.tsx         # full case editor with live preview
│           ├── cases-panel.tsx             # search / reorder / bulk actions
│           ├── cases-yaml.ts               # YAML import / export
│           ├── per-model-config.ts         # per-model run-config overrides
│           ├── selection.ts                # canonical model key
│           └── *.tsx                       # remaining UI components
├── .github/workflows/
│   ├── ci.yml                              # typecheck + build
│   ├── pages.yml                           # prod + per-PR preview deploys
│   ├── pr-cleanup.yml                      # remove preview on PR close
│   └── container.yml                       # multi-arch GHCR publish
├── docs/
│   └── browser-permissions.md              # per-browser CORS / mixed-content / PNA recipes
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
