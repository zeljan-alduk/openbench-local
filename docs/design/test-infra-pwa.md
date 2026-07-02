# Workstream design: Test infra (Vitest) + PWA

Verified against the repo as of `main` (75dfa6f): `package.json` has no test tooling; `vite.config.ts` is 10 lines (`base: './'`, `build.sourcemap: true`); tsconfig is a single project with `include: ["src"]`, `moduleResolution: "bundler"`, strict; CI = `.github/workflows/ci.yml` (typecheck → build → upload dist); Pages deploys prod to `/openbench-local/` and previews to `/openbench-local/pr-N/` on one gh-pages branch with `keep_files: true`; `public/` contains only `favicon.svg`; `src/` has no `vite-env.d.ts`; `main.tsx` is 13 lines.

---

## A. Vitest setup

### A1. Dependencies (devDependencies)

```jsonc
"vitest": "^3.2.4",
"@vitest/coverage-v8": "^3.2.4"
```

Vitest 3.x is the line built for Vite 5/6 (peer `vite ^5 || ^6`); pin coverage to the same minor (vitest enforces exact-version match with its coverage packages). **No `jsdom`/`happy-dom`** — every module in the test inventory is pure and node-importable (`environment: 'node'` default). No React component tests in v1.

New scripts in `package.json`:

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### A2. Config location: standalone `vitest.config.ts` (repo root, new file)

**Decision: separate `vitest.config.ts`, NOT a `test` block in `vite.config.ts`, and NOT `mergeConfig`.** Rationale:

- The tests are pure TS modules — they need no plugins, no `base`, no react transform. A standalone config means vitest never loads `vite.config.ts` at all (vitest gives `vitest.config.ts` priority and ignores the vite config when it exists), so `base: './'` and the react plugin can't interact with test resolution, and the upcoming PWA plugin never runs during tests.
- `vite.config.ts` sits outside `include: ["src"]`, so `tsc -b` never typechecks either config file — no tsconfig churn either way; the standalone file just keeps concerns separated in the same style as the repo's self-contained modules.

```ts
// vitest.config.ts
/**
 * Vitest config — standalone on purpose: tests cover only the pure,
 * node-importable modules (evaluator, generator, YAML codec,
 * capabilities, selection), so we don't load vite.config.ts (react
 * plugin, base './', PWA) at all.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/components/local-models/evaluator-direct.ts',
        'src/components/local-models/case-generate.ts',
        'src/components/local-models/cases-yaml.ts',
        'src/components/local-models/capabilities.ts',
        'src/components/local-models/selection.ts',
      ],
    },
  },
});
```

No coverage thresholds in v1 (add gates once the suite stabilizes; a red CI from a coverage dip on a UI-heavy repo would be noise).

### A3. tsconfig adjustments: none

**Decision: explicit imports (`import { describe, it, expect, vi } from 'vitest'`), `globals: false` (default).** Zero tsconfig changes:

- Test files live under `src/**`, so the existing `include: ["src"]` already typechecks them in `pnpm typecheck` and in `tsc -b` during `pnpm build`. That is desirable (tests are held to the same strict settings) and safe: `vite build` bundles only from the `index.html` entry graph, so `*.test.ts` never reaches the production bundle.
- No `"types": ["vitest/globals"]` — adding a `types` array would start restricting global `@types` inclusion and is exactly the churn to avoid.

### A4. File naming/placement convention

**Colocated, one test file per module:** `src/components/local-models/<module>.test.ts`, matching the repo's self-contained-module style (each module already carries its own header comment; its test sits beside it). Files in v1:

```
src/components/local-models/evaluator-direct.test.ts
src/components/local-models/case-generate.test.ts
src/components/local-models/cases-yaml.test.ts
src/components/local-models/capabilities.test.ts
src/components/local-models/selection.test.ts
```

Shared fixtures (if any grow) go in `src/components/local-models/test-fixtures.ts` — but v1 needs none; each test file is self-contained.

### A5. CI insertion (`.github/workflows/ci.yml`)

Insert between the existing "Type check" step (line 46) and "Production build" step (line 49):

```yaml
      - name: Unit tests
        run: pnpm test
```

Nothing else changes (pnpm/action-setup + node 24 + frozen lockfile already install devDeps).

### A6. Seedable-RNG refactor for `case-generate.ts` (prerequisite for deterministic tests)

`Math.random` appears at lines 53 and 59 of `src/components/local-models/case-generate.ts` (inside `sampleVar`). **Decision: thread an injectable RNG with a `Math.random` default — public behavior and the one production call site (`local-models-shell.tsx:228`) are untouched.**

Exact signatures:

```ts
/** Uniform [0,1) source, Math.random-shaped. Injectable for deterministic tests. */
export type Rng = () => number;

// internal — gains an rng param
function sampleVar(spec: VarSpec, scope: Record<string, unknown>, rng: Rng): unknown;
function sampleVars(gen: CaseGenerator, rng: Rng): Record<string, unknown>;

// public — default arg preserves the existing zero-arg-random behavior
export function materializeCase(c: InlineCase, rng: Rng = Math.random): InlineCase;
export function materializeCases(cases: readonly InlineCase[], rng: Rng = Math.random): InlineCase[];
```

Body changes: `Math.floor(Math.random() * …)` → `Math.floor(rng() * …)` at both sites; `materializeCases` passes `rng` through to `materializeCase`, which passes it to `sampleVars`. `evalExpr`, `fillTemplate`, `fillExpect`, `isParameterized` unchanged.

The seeded PRNG lives **in the test file only** (not app code):

```ts
/** mulberry32 — tiny deterministic PRNG for tests. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### A7. Test inventory (golden tests)

**`evaluator-direct.test.ts`** — drives `evaluateRow(row, expect, acceptWithRemark?, forgiveFormatting?)` and the `evaluateOutput` shim:

- `contains`: strict pass / strict fail; forgive ladder in order — NFKC fold (`CO₂` output vs `CO2` expected → pass with remark containing `Unicode formatting`), then case-only diff → remark `letter case`; same inputs with `forgiveFormatting` unset → `passed: false`.
- `not_contains`: pass/fail; **assert no soft pass even with `forgiveFormatting: true`** (guarded by comment at evaluator-direct.ts:103 — lock it in).
- `regex`: match; trailing-`\n` output still passes a `$`-anchored pattern (trim at :123); invalid pattern → `{passed:false, detail.error: 'bad regex: …'}`; forgive: `\boxed{B}` / `**B**` wrapper-stripped pass with remark; case-insensitive retry adds `i` flag (and doesn't double-add when pattern already has it).
- `exact`: trim-only strict pass; forgive: `(B)`, `"42"`, `` `B` `` wrappers → wrapper remark; case diff → `letter case` remark.
- `json_schema`: valid instance passes; non-JSON output → `detail.errors[0]` starts `output is not valid JSON`; schema violation → error paths prefixed `$`.
- `tool_call`: zero calls → `detail.error` mentions `no tool_calls`; wrong name → fail with `observedCalls` in detail; right name + no `argsSchema` → pass; right name + args schema pass; args not JSON → fail; **multiple calls where only the second matches → pass** (loop at :173).
- `acceptWithRemark` ordering: primary passes → no remark even when a clause would also match; primary fails, clause 1 and clause 2 both match → clause 1's remark wins; clause with empty/whitespace remark → `'Accepted alternative answer.'`; nothing matches → the **primary** failure's `detail` is returned (line 81); `forgiveFormatting` also applies inside accept clauses (`evalOne(..., forgive)` at :72).

**`case-generate.test.ts`** (all via `materializeCase(c, mulberry32(seed))`):

- `int` spec `{min, max, step}`: for a fixed seed assert the exact sampled value; property-style loop over 200 seeds asserting `min ≤ v ≤ max` and `(v - min) % step === 0`; `max < min` / `step ≤ 0` → falls back to original case (console.warn spied with `vi.spyOn`).
- `pick`: fixed-seed exact choice; empty pick → warn + case returned unchanged.
- `expr`: sees earlier vars in declaration order plus helpers (`count`, `counti`, `len`, `abs/floor/ceil/round/min/max`) and `Math`; throwing expr → fallback-unchanged.
- Template fill: `{{var}}` in `input` and in string-valued `expect` kinds (`contains|not_contains|regex|exact`); `json_schema`/`tool_call` expect returned untouched; unknown `{{name}}` left intact; `acceptWithRemark[].value` templates filled; `generate` key stripped from the result.
- `materializeCases` maps all and leaves plain cases by reference; `isParameterized` true/false.

**`cases-yaml.test.ts`**:

- Round-trip `decodeCasesYaml(encodeCasesYaml(cases))` deep-equals input for a fixture covering every expect kind, `generate` (pick+int+expr), `acceptWithRemark`, `forgiveFormatting`, `tags`, `weight`, `requires`, `tools`, `image.dataUrl`.
- **Unknown-field survival**: a case with an extra `xFutureField: 'keep-me'` survives encode→decode (the documented permissiveness; guards against someone "tidying" the codec).
- Accepted input shapes: `{version, cases}`, bare top-level list, `{suite:{cases}}`; scalar / `{}` / `{cases: 'nope'}` → throws with the "recognised cases array" message.
- One test per validation error branch in `validateShape`/`validateAccept`/`validateGenerate`: empty id, non-string input, expect without kind, non-finite weight, missing tags, bad accept kind / empty value / non-string remark, non-boolean forgiveFormatting, var with none of pick/int/expr, empty pick array, non-numeric int min/max, non-string expr.

**`capabilities.test.ts`** — table-driven fixture list `[modelId, InferredCapabilities][]` through `inferCapabilities`:

- Embedding short-circuit: `nomic-embed-text`, `bge-m3`, `text-embedding-3-small` → embedding true, all else false.
- Vision hits: `llava:13b`, `qwen2.5-vl-7b`, `moondream`, `minicpm-v`; reasoning hits: `qwen3:8b`, `deepseek-r1:7b`, `qwq`, `magistral`; tool-use hits: `mistral:7b`, `llama3.1`, `granite3-dense`.
- **Known-miss fixtures for the reported bug, asserting today's (wrong) behavior with a `// BUG:` comment**: `qwen2.5vl:7b` → vision false, `gemma3:12b` → vision false. The capabilities-fix workstream flips these expectations in the same PR as the regex fix — the tests are the spec of that fix.

**`selection.test.ts`**: `modelKey` composes `source::id::port` and distinguishes same id on different ports/sources. (Trivial, ~10 lines, cheap insurance since history/selection identity hangs on it.)

---

## B. PWA (`vite-plugin-pwa`)

### B1. Dependency + icon plan

- devDependency: `"vite-plugin-pwa": "^1.0.1"` (Vite 6-compatible line; bundles workbox 7). No runtime deps.
- Icons: generate once from `public/favicon.svg` with `pnpm dlx @vite-pwa/assets-generator --preset minimal-2023 public/favicon.svg` (one-off, **not** a permanent devDep), committing the outputs to `public/`: `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`. `index.html` `<head>` gains `<meta name="theme-color" content="#020617" />` and `<link rel="apple-touch-icon" href="./apple-touch-icon-180x180.png" />` (the plugin injects the manifest `<link>` itself).

### B2. The base `'./'` + multi-sub-path question (and the hard-incompatibility flag)

How it composes: with `base: './'` the plugin emits `sw.js` and `manifest.webmanifest` at the dist root with **relative** URLs; SW scope is derived from the SW file's deployed location, and Workbox resolves relative precache entries against `self.location`. So the same artifact self-configures at `/openbench-local/` and at `/openbench-local/pr-42/`.

**The hazard**: a prod SW registered at `/openbench-local/sw.js` has scope `/openbench-local/`, which *contains* every `pr-N/` preview. Browsers pick the longest-matching scope, but on the *first* visit to a preview the prod SW still controls the navigation. If the prod SW had a `navigateFallback`, it would serve the **prod** `index.html` for `/openbench-local/pr-42/` — you'd review prod code thinking it's the PR. Two independent mitigations, both adopted:

1. **`navigateFallback: null`** (see B3) — the prod SW never answers a navigation it doesn't have an exact precache entry for. `/openbench-local/pr-42/` maps (via Workbox's default `directoryIndex`) to `pr-42/index.html`, which is *not* in the prod precache, so it falls through to the network. Preview assets under `pr-42/assets/` likewise miss the precache. Previews therefore render correctly even while momentarily controlled by the prod SW.
2. **Register the SW only on the prod path** (see B5). Previews never install their own SW, so there is no per-PR SW churn, no stale preview SW left behind by `keep_files: true` on gh-pages, and no update-prompt noise while reviewing.

With both in place there is no remaining incompatibility — but flag in the PR description that anyone later adding `navigateFallback` or `runtimeCaching` re-opens hazard (1).

### B3. Never intercept LLM traffic — the guarantee

LLM calls go to `http://localhost:<port>/v1/chat/completions` etc. — always cross-origin from the deployed app (github.io/ai.aldo.tech), and even from a localhost dev server the port differs. The guarantee is structural, not filter-based:

- **No `runtimeCaching` entries at all.** Workbox only calls `event.respondWith()` for registered routes; unmatched fetches (every LLM request, every preview asset) pass to the network completely untouched — streaming SSE included.
- **`navigateFallback: null`** so the only fetch handler is the precache route, which matches exact same-origin precached URLs (+ `directoryIndex: 'index.html'` for the scope root — that alone gives offline app-shell launch, since this SPA has no client-side router or deep links).
- Precache = app shell only: `globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}']` — note `.map` is deliberately absent so `build.sourcemap: true` output isn't precached (also keeps entries under Workbox's 2 MiB per-file default).

### B4. `vite.config.ts` changes (exact)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we register manually in main.tsx (prod path only)
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'openbench-local',
        short_name: 'openbench',
        description:
          'Discover and benchmark local LLMs (Ollama, LM Studio, vLLM, llama.cpp) directly from your browser.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#020617',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: './',
  build: { outDir: 'dist', sourcemap: true },
});
```

Decisions embedded there:

- **`registerType: 'autoUpdate'`** (not prompt): a new SW activates via skipWaiting/clientsClaim but does **not** reload the page, so an in-flight benchmark run is never interrupted; the app is a small non-code-split bundle, so mid-session lazy-chunk mismatch (the usual autoUpdate risk) doesn't apply. A prompt UI would be the repo's first toast/snackbar primitive — not worth building for this.
- Relative `start_url: '.'` / `scope: '.'` resolve against the manifest URL, so one manifest works at both the github.io path and the ai.aldo.tech rewrite path.
- `devOptions` omitted (SW in production builds only; dev server never registers one).

### B5. Registration snippet + types

New file `src/vite-env.d.ts` (inside `include: ["src"]`, so **no tsconfig edit**; also formalizes `import.meta.env` typing which the repo currently lacks):

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

`src/main.tsx` — append after the existing render call:

```ts
import { registerSW } from 'virtual:pwa-register';

// PWA: install the service worker only on production deploys, never on
// gh-pages PR previews (/openbench-local/pr-<N>/). The prod SW's scope
// contains the preview paths; skipping registration there — plus
// navigateFallback:null in the SW itself — keeps previews always-live.
const isPrPreview = /\/pr-\d+\//.test(window.location.pathname);
if (import.meta.env.PROD && !isPrPreview && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
```

(`registerSW` with `registerType: 'autoUpdate'` needs no callbacks; `immediate: true` registers without waiting for the load event.)

### B6. CI

No ci.yml change needed for PWA — `pnpm build` now also emits `dist/sw.js`, `dist/workbox-*.js`, `dist/manifest.webmanifest`, all covered by the existing build step and dist artifact upload. (Optional hardening: a `test -f dist/sw.js` line in the build step; skip in v1.)

---

## File-change summary

| File | Change |
| --- | --- |
| `package.json` | +3 devDeps (`vitest`, `@vitest/coverage-v8`, `vite-plugin-pwa`), +3 scripts (`test`, `test:watch`, `test:coverage`) |
| `vitest.config.ts` | new (A2) |
| `src/components/local-models/case-generate.ts` | `Rng` type + rng threading (lines 53, 59; signatures of `materializeCase`/`materializeCases`) |
| `src/components/local-models/{evaluator-direct,case-generate,cases-yaml,capabilities,selection}.test.ts` | new (A7) |
| `.github/workflows/ci.yml` | insert `Unit tests` step between line 46 (typecheck) and line 49 (build) |
| `vite.config.ts` | add `VitePWA` plugin block (B4) |
| `src/vite-env.d.ts` | new, 2 triple-slash references (B5) |
| `src/main.tsx` | guarded `registerSW` call (B5) |
| `index.html` | `theme-color` meta + apple-touch-icon link (B1) |
| `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png` | new, generated once from `favicon.svg` (B1) |

Suggested landing order: PR 1 = Vitest infra + rng refactor + full test suite (pure, zero user-visible change); PR 2 = PWA (validated live on the PR's own gh-pages preview — where the SW correctly does NOT register, then on prod after merge).

## RISKS
- capabilities.test.ts intentionally pins today's buggy behavior for `qwen2.5vl`/`gemma3` fixtures; if the capabilities-fix workstream lands first, PR 1 must flip those two expectations or CI goes red — coordinate merge order.
- autoUpdate SW activates silently mid-session; a user who keeps a tab open across a deploy runs old JS against new precache. Harmless today (single bundle, no lazy chunks), but adding code-splitting later would require revisiting registerType or adding a reload prompt.
- Anyone later adding workbox `runtimeCaching` or a `navigateFallback` re-opens both hazards this design closes: prod SW hijacking /pr-N/ preview navigations, and potential interception of same-origin requests. The guarantee is 'no routes beyond precache' — document it in the vite.config comment.
- Once the prod SW ships, a subsequent decision to remove the PWA needs an explicit self-destructing SW (or users keep getting the cached shell); rollback is not just reverting the config.
- vitest and @vitest/coverage-v8 must stay version-locked (same minor); renovate/dependabot bumping one without the other fails at test startup.
- tsc -b now typechecks *.test.ts during `pnpm build` (they're under include:["src"]) — a type error in a test blocks the production build. Intended strictness, but worth stating so it doesn't surprise anyone.
- case-generate rng threading assumes no other module imports the internal sampleVar/sampleVars (verified true today); the refactor keeps them module-private so this stays safe.
- @vite-pwa/assets-generator output from the existing favicon.svg may need manual padding for the maskable variant (safe-zone crop) — budget a quick visual check of the generated PNGs.

## CRITIQUE (needs-changes)
- [major] B4's `injectRegister: false` silently disables skipWaiting/clientsClaim. Verified in vite-plugin-pwa@1.0.1 dist/index.js:834: `workbox.skipWaiting/clientsClaim = true` is applied only when `injectRegister === 'auto' || injectRegister == null` and registerType is 'autoUpdate'. With explicit `false`, the generated sw.js never calls skipWaiting()/clientsClaim(), so after a deploy the new SW stays in 'waiting' until every tab is closed — B4's stated mechanism ('activates via skipWaiting/clientsClaim') does not happen with this exact config.
  FIX: Set `injectRegister: null` instead of `false` (or omit it entirely — the default 'auto' resolves to null when `virtual:pwa-register` is imported, so no register script is double-injected into index.html). Keep the manual registerSW call in main.tsx.
- [major] B4's core rationale for `registerType: 'autoUpdate'` — 'a new SW activates ... but does NOT reload the page, so an in-flight benchmark run is never interrupted' — is factually wrong. Verified in vite-plugin-pwa@1.0.1 dist/client/build/register.js: in autoUpdate mode registerSW adds `wb.addEventListener('activated', e => { if (e.isUpdate || e.isExternal) window.location.reload() })`. Once issue #1 is fixed so updates actually activate, a deploy while a benchmark is running reloads the tab and kills the run. The 'RISKS ALREADY KNOWN' entry ('activates silently ... runs old JS against new precache') repeats the same wrong model.
  FIX: Use `registerType: 'prompt'` with bare `registerSW({ immediate: true })` and no onNeedRefresh/onOfflineReady callbacks: the new SW installs and waits, the open tab is never reloaded, and the update activates on the next fresh visit. This matches the design's actual goals (never interrupt a run, no toast/prompt UI to build). Update the vite.config comment and risk list accordingly.
- [major] capabilities.test.ts fixture error: the design lists `granite3-dense` under 'tool-use hits', but running the actual capabilities.ts regexes shows toolUse=false — `\b(…|granite|…)\b` fails because 'granite' is followed by the digit '3' (no word boundary), and no other alternative or the reasoning fallback matches. As designed, PR 1's test suite is red in CI on day one. (Same digit-suffix regex bug class as the pinned `gemma3` miss.)
  FIX: Change the fixture to an id that matches today, e.g. `granite-code` or `granite:8b` — or better, move `granite3-dense` into the known-miss `// BUG:` group alongside `qwen2.5vl:7b` and `gemma3:12b`, since it is another instance of the exact bug the capabilities-fix workstream will address.
- [minor] A5's CI line anchors are wrong: in .github/workflows/ci.yml the 'Type check' step is at lines 39-40 and 'Production build' at lines 42-43; lines 46 and 49 are `uses: actions/upload-artifact@v4` and `path: dist`. Inserting literally 'between line 46 and line 49' would place the Unit tests step after the production build (and inside/around the artifact upload).
  FIX: Anchor the insertion semantically: add the `Unit tests` step between the `Type check` step (ci.yml:39-40) and the `Production build` step (ci.yml:42-43).
- [minor] A7's regex sub-test "doesn't double-add `i` when pattern already has it" is untestable: evaluator-direct.ts builds `new RegExp(expect.value)` with no flags argument, so `re.flags` is always '' and the `re.flags.includes('i')` branch at line 130 is dead code — no `expect.value` string can carry flags in JS.
  FIX: Drop that sub-test from the inventory (keep the plain 'CI retry adds the i flag' assertion). Optionally note the dead branch as a candidate simplification in evaluator-direct.ts.
- [minor] A6 claims 'the one production call site (local-models-shell.tsx:228)' for the rng refactor, but there are two: `materializeCases(effectiveSuite.cases)` at local-models-shell.tsx:230 and a second `materializeCase(c)` at local-models-shell.tsx:484 (per-case re-roll). The default `rng = Math.random` keeps both working unchanged, so there is no functional break — but the design's verification statement is incomplete and the :228 anchor is off by two lines.
  FIX: Correct the design text to name both call sites (local-models-shell.tsx:230 and :484) so the refactor's blast-radius claim is accurate; no code change needed beyond the default-arg approach already specified.