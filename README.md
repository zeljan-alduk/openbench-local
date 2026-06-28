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
2. **Runs a 94-case eval suite** against every model you select.
   Each case carries one or more **tags** so you can group cases by
   capability and either filter the panel view or opt-in to running
   only the matching subset. Coverage:

   - Instruction-following &amp; constrained generation, JSON output
     (flat / nested / array)
   - Code: trace, debug (off-by-one), Big-O, SQL clauses, language
     ID, one-line generation
   - Math: word problems (rates, age, multi-step), algebra,
     geometry, sequences, probability (coins, dice), arithmetic
     (decimal · hex · binary · modular)
   - Logic: knights &amp; knaves, classic gotchas, fallacies, family
     relations, syllogisms, object tracking, pragmatic implicature
   - Ciphers (Caesar · ROT13) and base64 decoding
   - Commonsense (physics, time, social), science facts
   - Classifiers: sentiment, spam, enum, topic, toxicity, question
     vs statement, language identification
   - Multilingual translation, retrieval &amp; passage
     comprehension, multi-step inference, refusal,
     prompt-injection resistance
   - Character-level gotchas (counting letters, palindromes,
     anagrams, reversal), strict multi-line / single-line / case
     formatting
   - Native tool calling, vision (counting · OCR · spatial)

   Cases auto-skip on models that lack the required capability
   (`tool_use` / `vision`).

   Typical wall-clock for a single model on a modern laptop is
   **~10–15 minutes** for the full 94-case run (closer to 5 min
   for a fast 7B, 25+ min for a reasoning model on high effort).
   The runner is sequential per model so multi-model comparisons
   scale linearly. **Use the category filter** to run a single
   capability in seconds when you're iterating.
3. **Streams results live** as each case finishes, with pass-rate, mean
   tok/s, p95 latency, and total wall-clock per model. When you pick
   two or more models, an interactive **Quality × Speed scatter**
   surfaces the Pareto frontier — bubble size encodes total bench
   time, dot colour is unique per **run** (so re-running the same
   model with different params gets a distinct point), hover for a
   detail card. A run-filter dropdown above the chart lets you
   include/exclude individual runs without losing them from history.
4. **Persists run history** in IndexedDB. Each Start appends new
   results rather than wiping the previous comparison — you can
   compare three models that each need a model unload/reload between
   them, refresh the page, and everything is still there. The
   **History dialog** lets you browse, bulk-delete, or wipe stored
   runs. *Clear last run* only drops the most recent session.
5. **Exports everything** — interactive HTML (collapsible, printable,
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

The 94 cases are inlined in
[`src/components/local-models/builtin-suite.ts`](src/components/local-models/builtin-suite.ts).
Each case has:

- a prompt (and optional vision image, base64-encoded inline),
- an expected-shape evaluator (substring match, regex, JSON schema, or
  expected tool-call name + args),
- one or more **tags** that group it into capability categories (see
  below),
- a capability gate (`tool_use`, `vision`) that lets it auto-skip on
  unsupported models so the pass-rate denominator stays honest.

Scoring is computed in the browser by
[`evaluator-direct.ts`](src/components/local-models/evaluator-direct.ts) — no
LLM-as-judge, no network round-trip, deterministic. The `regex`
evaluator trims trailing whitespace before matching so a stray newline
from a chat model doesn't defeat `$` anchors.

Inspirations: the suite borrows ideas from **TruthfulQA** (common
misconceptions), **HumanEval** (one-line code generation), **GSM8K**
(multi-step word problems), **BBH** (object tracking, syllogisms),
**IFEval** (constrained generation), and **DROP** (passage
comprehension), adapted to a strict-output single-turn format that
scores deterministically without an LLM judge.

### Tags &amp; categories

Every case is labeled with a small set of tags — the running set
includes `instruction-following`, `structured-output`, `code`,
`reasoning`, `math`, `arithmetic`, `algebra`, `geometry`, `sequence`,
`probability`, `logic`, `commonsense`, `cipher`, `encoding`,
`character-level`, `tool-use`, `native`, `routing`, `safety-shape`,
`gotcha`, `classification`, `multilingual`, `retrieval`,
`comprehension`, `mid-context`, `long-context`, `tracking`,
`world-knowledge`, `science`, `fact`, `sorting`, `vision`, `counting`,
`ocr`, `spatial`, `fast`, and a few others.

The Eval-cases panel shows them as a **chip filter row**:

- Click any chip to filter the panel view to that tag (multi-select
  unions — a case is shown if it carries at least one selected tag).
- Each chip displays its case count, so you can see at a glance how
  many cases a category contains.
- Per-row tags are clickable too — toggle the filter directly from a
  case row without scrolling to the chip bar.
- An **Apply category filter to run** checkbox lets you opt in to
  running only the filtered subset (otherwise the filter is
  view-only and the runner still uses every enabled case). The
  `Run rating` button label and "X of N cases will run" header
  update accordingly. Cases are deduplicated when they match
  multiple selected tags.

## Generation parameters

The "Setup" panel (between Discover and Run) sets a global generation
profile: `temperature`, `top_p`, `max_tokens`, `seed`, **thinking
mode** (`engine default` / `off — suppress` / `low` / `medium` / `high`),
**per-case timeout**, **repeat each case N×** (1 / 2 / 3 / 5 to
surface flakiness), optional warm-up call, and a system prompt.
Toggle the **Override** switch (off by default) to make these win
across every model; otherwise the engine's own defaults apply for any
field you leave blank.

Per-model overrides are available via the gear icon on a model card,
including a **Pull from engine** button that reads the model's
loaded sampling defaults straight from the engine
(Ollama Modelfile / llama.cpp `/props` / LM Studio metadata) so the
bench respects whatever you configured upstream.

Precedence: per-model override → global override (when the switch is
on) → engine default. Open DevTools → Network → any
`chat/completions` request → Payload tab to see the exact JSON we
shipped.

## Quality × Speed scatter chart

When two or more models are benched, an interactive scatter plot
materialises above the per-case grid with three encoded dimensions
plus engine identity:

| Encoding | What it shows |
| --- | --- |
| **Y axis** | Pass rate (0–100%) — higher = better quality |
| **X axis** | Mean tokens / second — right = faster throughput |
| **Bubble size** | Total bench wall-clock time — smaller = faster overall |
| **Bubble colour** | Deterministic per `runId` (each individual run gets its own colour, so re-running the same model with different params is visually distinct) — 24-entry palette |
| **Dashed accent line** | Pareto frontier — non-dominated set; rational picks for any quality / speed trade-off |
| **Soft coloured ring** | Marks frontier members |

Polish:

- **Per-model labels** next to each dot (model id, truncated at 28
  chars, in the dot's own colour with a `paint-order: stroke`
  bg-elevated outline so they read cleanly over gridlines).
- **Collision-aware placement** — labels try 8 candidate positions
  (cardinal + diagonal); Pareto-frontier and high-pass-rate models
  get first pick so headline dots stay unobstructed.
- **Hover** (or keyboard focus) on any dot or legend chip pops a
  tooltip with model id, source + endpoint, exact pass-rate,
  passed/total, avg tok/s, p95 latency, total wall-clock. Auto-flips
  near canvas edges.
- **Size legend** below the chart shows two reference dots scaled to
  the actual fastest / slowest run-times, so the encoding is grounded
  in real numbers instead of a blanket "smaller = faster" claim.
- **Filter runs** dropdown in the chart header — checkbox per run so
  you can include/exclude individual entries without removing them
  from history. Useful when comparing the same model across many
  parameter settings.
- Renders nothing for a single run (no comparison to make).
- Pure inline SVG, no chart library — ~+8 KB to the bundle vs. ~+200
  KB if we'd pulled in recharts.

## Run history

Every finished bench is persisted to **IndexedDB** under the database
`openbench-local`, keyed by `runId` and grouped by `sessionId` (one
session per Start click — a batch of three models started together
becomes one session of three runs).

What this means in practice:

- **Append on Start, never replace.** Pressing `Run rating` adds new
  results to the existing comparison instead of clearing it. You can
  bench three models that each need an unload/reload of the previous
  one (so a "compare batch" isn't possible) and still see all three
  side-by-side at the end.
- **Survives reloads.** Refreshing the page hydrates everything from
  IndexedDB — the comparison table, the chart, and the history.
- **Per-run parameters captured.** Each stored run remembers the
  effective sampling parameters that produced it (temperature,
  reasoning effort, top_p, seed, …). Re-running the same model with a
  different temperature produces a *new* history entry with its own
  params — useful for "is this regression from the model or from
  the params?" investigations.
- **History dialog** (top-right `History` button) shows every
  stored run grouped by session. Per-run and per-session delete,
  checkbox bulk-select, and a `Delete all` (with confirm) for a
  full wipe. Image data URLs are stripped before persistence to
  stay clear of the IDB quota; output, reasoning trace, evaluator
  detail, and timings are all preserved.
- **`Clear last run`** in the page header only pops the most recent
  session — older runs stay both visible and persisted. The
  *History* dialog is for everything else.

Image data URLs are stripped before persistence to keep storage
size bounded; the rebuildable case definitions still carry them
for re-runs.

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
  **Reset all** to roll back the entire suite to the shipped 94 cases.
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

## Advanced

### Per-model overrides & engine defaults

Each discovered model has a gear icon → **per-model config** modal
with a **Pull from engine** button. The modal has two distinct
surfaces with different rules.

#### Form fields (editable, take effect per request)

`temperature`, `top_p`, `max_tokens`, `seed`, `reasoning_effort`,
`warm-up ping`, `system_prompt`.

- ✅ Editable in the browser.
- ✅ **Sent on every** `POST /v1/chat/completions` and **honoured by
  the engine for that request only.**
- The engine's loaded defaults are overridden *just for the requests
  openbench-local makes*. Other clients (LM Studio's chat UI, Ollama
  Open WebUI, your own scripts) keep using the engine-side defaults
  — we never touch the engine's persistent config.

#### Read-only "Load-time settings" (display only)

`num_ctx`, GPU offload, KV cache, RoPE frequency, batch size,
`top_k`, `repeat_penalty`, `mirostat`, `quantization`, `arch`, etc.

- ❌ Not editable in the browser.
- ❌ Wouldn't take effect even if they were — the OpenAI-compat
  `/v1/chat/completions` body **has no fields for them**. Reloading
  the model is the only way to change them, and that's an engine-
  side decision.
- Configure them where the engine wants: LM Studio "Load with custom
  config", Ollama `Modelfile` / `ollama run` flags, vLLM / llama.cpp
  launch args.

#### Precedence chain (per request)

For each parameter we send:

1. **Per-model override** (gear modal) — wins if set.
2. **Global override** (Setup panel, opt-in via the *Override* toggle
   — **off by default**) — wins if the toggle is on and the field is
   set.
3. **Engine's own default** (Modelfile / launch flag / desktop UI) —
   wins if neither of the above is set; we simply omit the field
   from the request body.

This is why "Pull from engine" + default-off override is the
recommended workflow: every model runs against its own engine-
configured sampling defaults, cross-client behaviour stays
consistent, and the bench numbers reproduce against the same loaded
state you'd get from the engine's own UI.

#### Verifying what's actually sent

If a result surprises you and you want ground truth: open browser
DevTools → Network tab → click any `chat/completions` request →
**Payload** tab shows the exact JSON body openbench-local sent.
That's what the engine saw.

### API keys (LM Studio, vLLM, llama.cpp, reverse proxies)

Some local engines and any reverse proxy in front of one require an
`Authorization: Bearer <key>` header on every request. Recent
versions support this natively:

| Engine | How to enable | Where the key is set |
| --- | --- | --- |
| **LM Studio** | Server settings → "Require API key" | Settings tab |
| **vLLM** | `vllm serve <model> --api-key sk-…` | CLI flag |
| **llama.cpp** | `llama-server -m <gguf> --api-key sk-…` | CLI flag |
| **Ollama** | No native auth — front it with nginx / Caddy + basic-auth or a Bearer middleware | Reverse proxy config |

`openbench-local` has a dedicated **API keys** panel (right under
Custom hosts on the page). Each entry is a `host:port → key` pair;
the key is sent on:

- Every discovery probe (so an authed engine actually shows up
  instead of failing the probe with `HTTP 401 · API key needed`)
- Every chat-completion request the bench runner sends to that host
- The pre-bench warm-up call

Storage:

- Keys live in `localStorage` under `openbench-local:auth` in
  **plain text**, same as every other preference. The storage
  notice surfaces this so users can decide whether the keys they
  paste in are appropriate for that.
- Keys are **never** included in exported reports (Markdown / JSON /
  interactive HTML), copied into URLs, or logged to console.
- The display in the panel is masked (`sk-•••…•••3f7a`); the
  textarea uses `type="password"` so screen-recorders / shoulder-
  surfers don't catch it.

If you need stronger protection than localStorage offers — shared
machine, untrusted browser extensions, etc. — front the engine with a
reverse proxy that handles auth out-of-band (mTLS, OAuth proxy,
Tailscale Funnel with ACLs, etc.) instead of giving the browser a
long-lived Bearer token.

### Remote LLMs (LAN, VPN, SSH-tunnel)

Running the LLM on a different machine — homelab GPU box, office
workstation, VPN-reachable server? Three working topologies:

- **LAN / VPN** — add the IP or hostname in the **Custom hosts**
  panel; no tunnel needed.
- **SSH** — `ssh -N -L 11434:localhost:11434 user@host` drops the
  remote LLM onto your laptop's loopback so the page treats it as
  `127.0.0.1` (skips mixed-content + PNA hassles in one move).
- **Local reverse proxy** — Caddy or nginx on loopback when you
  have several remotes or need to inject CORS / TLS-terminate.

Full recipes, caveats, and security notes:
**[`docs/remote-models.md`](docs/remote-models.md)**.

### Per-browser permissions

Step-by-step instructions per browser (Chrome / Edge / Brave,
Firefox, Safari, mobile), including PNA flags, Brave Shields, and
Safari's mixed-content workaround:
**[`docs/browser-permissions.md`](docs/browser-permissions.md)**.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

The eval suite is intentionally inlined as data — adding a case is a
TypeScript edit in `builtin-suite.ts`, no harness rewiring required.

## License

MIT — see [LICENSE](LICENSE).
