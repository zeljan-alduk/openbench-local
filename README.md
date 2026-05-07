# openbench-local

> Discover and benchmark every local LLM on your machine, in seconds, from your browser.
> 100% client-side. No signup. Nothing leaves localhost.

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

Then start at least one local LLM server:

| Engine     | Default port | One-line start                                |
| ---------- | ------------ | --------------------------------------------- |
| Ollama     | 11434        | `ollama serve` (started by the desktop app)   |
| LM Studio  | 1234         | "Local Server" tab → Start Server             |
| vLLM       | 8000         | `vllm serve <model>`                          |
| llama.cpp  | 8080         | `llama-server -m <gguf>`                      |

The page auto-discovers each one. The first model is auto-selected; tap
more cards to compare side-by-side.

## CORS — read this first

Browsers block cross-origin requests by default. From an HTTPS page,
hitting `http://127.0.0.1:11434` is technically a mixed-content +
cross-origin request. The page surfaces an inline help panel with
copy-pasteable per-engine config (`OLLAMA_ORIGINS`, LM Studio's CORS
toggle, vLLM `--allowed-origins`, llama.cpp `--cors`) when probes fail.

If you run the page from `http://localhost:5173` (the default
`pnpm dev` URL), most engines work out of the box because the origin
is loopback HTTP.

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

## Build for production

```bash
pnpm build
```

Outputs static files to `dist/`. Deploy anywhere — GitHub Pages,
Netlify, Cloudflare Pages, S3, or just `npx serve dist`.

`vite.config.ts` sets `base: './'` so the build is portable to any
sub-path on a parent domain.

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
