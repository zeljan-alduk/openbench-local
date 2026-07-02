# Quant A/B Comparison — Design

## 0. Overview

Four deliverables, three new files, three edited files. All pure logic (parsing, grouping, stats) lives in two node-importable `.ts` modules with zero React imports so they slot into a future test harness. UI additions follow the existing section-card idiom (`rounded-2xl border border-border bg-bg-elevated shadow-sm`) and the PhaseChip tone map.

**New files**
- `src/components/local-models/model-id-parse.ts` — pure id parser (~120 ln)
- `src/components/local-models/quant-ab.ts` — pure grouping + Wilson CI + verdict (~140 ln)
- `src/components/local-models/quant-ab-panel.tsx` — the A/B delta-table view (~220 ln)

**Edited files**
- `multi-bench-panel.tsx` — third view toggle (:73, :84-90, :93)
- `quality-speed-chart.tsx` — same-group connector polylines (:28 Point, :127 points memo, :518 render)
- `discovery-direct.ts` — optional `quant`/`paramSize` on `DiscoveredLocalModel` + engine-metadata capture (:34, :78, :94, :162, :346)

---

## 1. `model-id-parse.ts` — pure parser

### Types & signatures

```ts
export interface ParsedModelId {
  /** Canonical family+version, lowercase, no letter-digit hyphen: 'llama3.1', 'qwen2.5-coder'. */
  readonly base: string;
  /** Normalized parameter count: '8b' | '8x7b' | '135m' | null when absent. */
  readonly params: string | null;
  /** Normalized quant label: 'Q4_K_M' | 'IQ2_M' | 'FP16' | 'AWQ' | 'GPTQ' | 'QAT' | … | null. */
  readonly quant: string | null;
}

export function parseModelId(rawId: string): ParsedModelId;
/** 'q4_k_m' → 'Q4_K_M'; 'f16' → 'FP16'; unknown token → null. Exported for the meta fallback path. */
export function normalizeQuant(raw: string): string | null;
/** Effective bit width for precision ranking; null = unknown. */
export function quantBits(quant: string | null): number | null;
/** `${base}::${params ?? '?'}` — the coarse grouping key (quant stripped). */
export function groupKeyFor(parsed: ParsedModelId): string;
```

### Algorithm (in order — order matters)

1. **Segment**: `seg = rawId.split('/').pop()`, strip `/\.gguf$/i`. (Drops HF org / LM Studio publisher / llama.cpp path — deliberate, enables cross-engine grouping.)
2. **Ollama tag**: if `seg` contains `:`, split once into `name` + `tag`; discard tag when it is `latest`. Work on `name + '-' + tag`.
3. **Extract quant** (delete matched span from the working string). Case-insensitive, two alternations, GGUF first:

```ts
const QUANT_GGUF_RE =
  /(?:^|[-_.:\s])(i?q[1-8](?:_[a-z0-9]{1,3}){0,2})(?=$|[-_.:\s])/i;
const QUANT_METHOD_RE =
  /(?:^|[-_.:\s])(fp32|f32|bf16|fp16|f16|fp8|fp4|int8|int4|nf4|w4a16|w8a8|w8a16|awq|gptq|exl2|mlx|qat|[248]bit)(?=$|[-_.:\s])/i;
```

   Note the leading-boundary class includes `:` so Ollama tags like `8b-instruct-q4_K_M` and bare `qwen2.5:q8_0` both match; `q` must be followed by a digit 1-8 so `qwen`/`qwq` never false-positive.
4. **Extract params** (delete matched span):

```ts
const PARAMS_MOE_RE   = /(?:^|[-_.:\s])(\d+x\d+(?:\.\d+)?)b(?=$|[-_.:\s])/i;
const PARAMS_DENSE_RE = /(?:^|[-_.:\s])(\d+(?:\.\d+)?)([bm])(?=$|[-_.:\s])/i;
```

   Normalize lowercase: `'8B'→'8b'`, `'8x7B'→'8x7b'`, `'135M'→'135m'`. Version tokens like `v0.1` never match (no separator between `v` and digit).
5. **Base**: tokenize the remainder on `/[-_\s:]+/` (dots preserved for `3.1`), lowercase, drop noise tokens `NOISE = new Set(['instruct','it','chat','gguf','hf',''])`, join with `-`, apply alias `^meta-llama` → `llama`, then collapse the letter-hyphen-digit seam: `.replace(/([a-z])-(?=\d)/g, '$1')` so `llama-3.1` ≡ `llama3.1` and `phi-4` ≡ `phi4`.

### `normalizeQuant`

GGUF tokens → uppercase with underscores (`Q4_K_M`, `Q8_0`, `IQ2_M`). `f16|fp16→FP16`, `f32|fp32→FP32`, `bf16→BF16`, method tokens → uppercase (`AWQ`, `GPTQ`, `QAT`, `NF4`, `INT8`, `W4A16`, `4BIT`…). Non-matching input → `null`. This same function is applied to engine metadata (Ollama `quantization_level`, LM Studio `quantization`) so both paths converge on one vocabulary.

### `quantBits`

| label | bits |
|---|---|
| FP32/F32 | 32 |
| BF16/FP16 | 16 |
| FP8/INT8/W8A8/W8A16/8BIT/Q8_* | 8 |
| Q6_* | 6 |
| Q5_* | 5 |
| Q4_*/IQ4_*/AWQ/GPTQ/INT4/NF4/W4A16/QAT/EXL2/4BIT/FP4 | 4 |
| Q3_*/IQ3_* | 3 |
| Q2_*/IQ2_*/2BIT | 2 |
| IQ1_* | 1 |
| MLX / unknown / null | null |

GGUF rank = leading digit of the `Q`/`IQ` token — no table maintenance for new suffix letters.

### Test vectors (16)

| # | input | base | params | quant |
|---|---|---|---|---|
| 1 | `llama3.1:8b-instruct-q4_K_M` | `llama3.1` | `8b` | `Q4_K_M` |
| 2 | `qwen2.5:14b` | `qwen2.5` | `14b` | null |
| 3 | `qwen2.5:latest` | `qwen2.5` | null | null |
| 4 | `llama3.1:8b-instruct-fp16` | `llama3.1` | `8b` | `FP16` |
| 5 | `gemma3:27b-it-qat` | `gemma3` | `27b` | `QAT` |
| 6 | `lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf` | `llama3.1` | `8b` | `Q4_K_M` |
| 7 | `qwen2.5-14b-instruct` | `qwen2.5` | `14b` | null |
| 8 | `Qwen/Qwen2.5-14B-Instruct-AWQ` | `qwen2.5` | `14b` | `AWQ` |
| 9 | `TheBloke/Llama-2-7B-Chat-GPTQ` | `llama2` | `7b` | `GPTQ` |
| 10 | `meta-llama/Llama-3.1-8B-Instruct` | `llama3.1` | `8b` | null |
| 11 | `neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8` | `llama3.1` | `8b` | `FP8` |
| 12 | `Qwen2.5-14B-Instruct-Q4_K_M.gguf` | `qwen2.5` | `14b` | `Q4_K_M` |
| 13 | `/models/Meta-Llama-3.1-8B-Instruct-IQ2_M.gguf` | `llama3.1` | `8b` | `IQ2_M` |
| 14 | `mixtral:8x7b-instruct-v0.1-q5_K_M` | `mixtral-v0.1` | `8x7b` | `Q5_K_M` |
| 15 | `smollm2:135m-instruct-q8_0` | `smollm2` | `135m` | `Q8_0` |
| 16 | `qwen2.5-coder:14b-q6_K` | `qwen2.5-coder` | `14b` | `Q6_K` |

Vectors 1↔6↔10 and 2↔7↔8↔12 prove cross-engine grouping (Ollama ↔ LM Studio ↔ vLLM ↔ llama.cpp). Vector 16 proves `coder` variants do NOT merge with the chat family. Embed vectors as a `const TEST_VECTORS` block comment in the module until a test runner exists (the module is node-importable for ad-hoc verification via `node --experimental-strip-types`).

### Metadata fallback plumbing (`discovery-direct.ts`)

Extend `DiscoveredLocalModel` (:34) with two optional fields — backward compatible with localStorage selections and IDB v1 `StoredRun.model` blobs (old records simply lack them):

```ts
/** Engine-reported quantization label, when the server exposes it (e.g. 'Q4_K_M'). */
readonly quant?: string;
/** Engine-reported parameter size (e.g. '8.0B'). */
readonly paramSize?: string;
```

- **Ollama** (:78-87): `/api/tags` already returns `details: { quantization_level, parameter_size }` per model — widen the parse type and pass both through `buildModel` (:162, add to opts + conditional spread). Zero extra requests. This closes the biggest hole: `qwen2.5:14b` is silently Q4_K_M on disk.
- **LM Studio**: add an optional hook to `ProbeSpec` (:59): `enrich?(models: readonly DiscoveredLocalModel[], displayBaseUrl: string, headers: Record<string,string>): Promise<readonly DiscoveredLocalModel[]>`. Implement for `lmstudio` only: one best-effort `GET {display}/api/v0/models`, build `id → quantization` map, merge. Call from `probeOneFromSpec` after :346 inside `try/catch` — failure (old LM Studio, CORS) returns models unchanged.
- **vLLM / llama.cpp**: nothing; id parsing only.

---

## 2. Grouping — `quant-ab.ts` (pure, node-importable)

Deliberately does NOT import `ModelRunState` (that lives in a `.tsx`); consumers map into a minimal structural input.

```ts
export interface QuantRunInput {
  readonly runId: string;
  readonly modelId: string;
  readonly source: string;          // DiscoverySource, string here for purity
  readonly sessionId: string;
  readonly startedAt: number;
  readonly metaQuant?: string;      // DiscoveredLocalModel.quant
  readonly metaParamSize?: string;  // DiscoveredLocalModel.paramSize ('8.0B')
  readonly passed: number;          // BenchSummary.passed
  readonly total: number;           // BenchSummary.total (skips already excluded)
  readonly avgTokPerSec: number | null;
  readonly p95LatencyMs: number;
}

export interface CI { readonly lo: number; readonly hi: number }
/** Wilson score interval, z = 1.96. total === 0 → { lo: 0, hi: 1 }. */
export function wilson95(passed: number, total: number): CI;

export type QuantVerdict = 'baseline' | 'holds' | 'degrades';

export interface QuantVariant {
  readonly input: QuantRunInput;
  readonly quant: string;           // normalized label, or 'unknown'
  readonly quantAssumed: boolean;   // true when defaulted (vLLM bare id → FP16)
  readonly bits: number | null;
  readonly passRate: number;
  readonly ci: CI;
  readonly isBaseline: boolean;
  readonly deltaPp: number | null;  // (variant − baseline) × 100; null on baseline
  readonly speedup: number | null;  // tok/s ratio vs baseline; null when either is null
  readonly verdict: QuantVerdict;
}

export interface QuantGroup {
  readonly groupKey: string;        // 'llama3.1::8b'
  readonly base: string;
  readonly params: string | null;
  readonly variants: readonly QuantVariant[]; // baseline first, then bits desc, then startedAt
  /** True when variants come from different Start clicks — parameterized cases differ. */
  readonly crossSession: boolean;
}

export function buildQuantGroups(inputs: readonly QuantRunInput[]): readonly QuantGroup[];
/** Also exported for the chart: groupKey or null for a single run. */
export function groupKeyForRun(modelId: string, source: string, metaQuant?: string, metaParamSize?: string): string | null;
```

**Effective quant resolution** (in `buildQuantGroups` / `groupKeyForRun`), in priority order: (1) `parseModelId(modelId).quant`; (2) `normalizeQuant(metaQuant)`; (3) source-specific default: `source === 'vllm'` → `'FP16'` with `quantAssumed: true` (vLLM serves unquantized unless the id says otherwise); (4) `'unknown'`. **Params resolution**: parsed params, else `metaParamSize` normalized (`'8.0B'` → `'8b'`, trailing `.0` stripped).

**Group admission**: bucket by `groupKey`; keep only groups with ≥ 2 entries carrying ≥ 2 *distinct* effective quant labels and `total > 0` on every kept entry. (Two runs of the same quant are a re-run, not an A/B — excluded, counts toward the empty state.)

**Baseline selection**: max `quantBits` (nulls sort last); tie → higher `passRate`; tie → earlier `startedAt`.

**Verdict** (CI-overlap rule, exactly two outcomes for non-baselines): `variant.ci.hi < baseline.ci.lo` → `'degrades'`; otherwise → `'holds'` (overlap, or point estimate above baseline). At n=100, 90% pass gives roughly ±6-7 pp — the table must show the CI so a "holds" verdict reads as "not distinguishable at this suite size", not "proven equal".

Wilson implementation:

```ts
export function wilson95(passed: number, total: number): CI {
  if (total === 0) return { lo: 0, hi: 1 };
  const z = 1.96, n = total, p = passed / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { lo: Math.max(0, (centre - margin) / denom), hi: Math.min(1, (centre + margin) / denom) };
}
```

---

## 3. Quant A/B view — `quant-ab-panel.tsx` + toggle wiring

### `multi-bench-panel.tsx` edits

- **:73** — `const [view, setView] = useState<'by-model' | 'by-case' | 'quant-ab'>('by-model');`
- **:84-90** — third `<ToggleBtn active={view === 'quant-ab'} onClick={() => setView('quant-ab')}>Quant A/B</ToggleBtn>` after "By case".
- **:93** — add `{showCompare && view === 'quant-ab' ? <QuantAbPanel runs={runs} /> : null}` (the `view === 'by-model' || !showCompare` branch at :94 is untouched).

### `QuantAbPanel`

```ts
export function QuantAbPanel({ runs }: { runs: readonly ModelRunState[] }): React.ReactElement;
```

`useMemo`: filter `runs` to `summary !== null`, map to `QuantRunInput` (`metaQuant: r.model.quant`, `metaParamSize: r.model.paramSize`), call `buildQuantGroups`.

**Empty state** (groups.length === 0): one section card — header "Quant A/B", body copy: "No quant pairs detected. Bench two quantizations of the same base model — e.g. `llama3.1:8b-instruct-q4_K_M` vs `llama3.1:8b-instruct-q8_0` — and the delta table appears here." Renders instead of nothing so the toggle never feels dead.

**Per-group section** (one card per `QuantGroup`, same shell as ByCaseGrid :153): header shows `{base} · {params ?? 'size unknown'}` plus a faint amber warning line when `crossSession` ("variants ran in different sessions — parameterized cases were re-randomized, deltas are noisier").

Delta table columns:

| Column | Cell |
|---|---|
| Quant | mono label (`Q4_K_M`), `title` = full model id + source; faint ` (assumed)` suffix when `quantAssumed`; run clock time (`fmtClockShort`) when the group has duplicate labels |
| Pass rate | `87/100 · 87.0%` + second line `CI 79.0–92.2%` in `text-[10px] text-fg-muted`; tri-color threshold on the % (≥90 emerald / ≥60 amber / red — same idiom as `CompareRow` :283) |
| Δ vs baseline | `—` on baseline; else signed `±X.X pp`, emerald when ≥ 0, red when < 0, `tabular-nums` |
| Avg tok/s | value + `(1.8×)` speedup vs baseline in `text-fg-muted` |
| P95 | `X.X s` |
| Verdict | chip, PhaseChip styling: baseline → `bg-bg-subtle text-fg-muted` "Baseline"; holds → `bg-emerald-500/15 text-emerald-700 dark:text-emerald-400` "Quality holds"; degrades → `bg-red-500/15 text-red-600 dark:text-red-400` "Degrades" |

Rows ordered baseline-first then bits descending — the eye reads top-to-bottom as "precision going down".

---

## 4. Scatter enhancement — `quality-speed-chart.tsx`

- **Point type (:28-41)**: add `readonly groupKey: string | null;`
- **points memo (:127-148)**: compute `groupKey: groupKeyForRun(r.model.id, r.model.source, r.model.quant, r.model.paramSize)` (import from `quant-ab.ts`).
- **New memo** after `frontier` (:171):

```ts
const quantLinks = useMemo<readonly (readonly Point[])[]>(() => {
  const byGroup = new Map<string, Point[]>();
  for (const p of points) {
    if (p.groupKey === null) continue;
    const arr = byGroup.get(p.groupKey) ?? [];
    arr.push(p);
    byGroup.set(p.groupKey, arr);
  }
  return [...byGroup.values()]
    .filter((g) => g.length >= 2)
    .map((g) => [...g].sort((a, b) => a.avgTokPerSec - b.avgTokPerSec));
}, [points]);
```

- **Render (insert immediately BEFORE the frontier polyline at :519**, so it sits under both frontier and dots):

```tsx
{quantLinks.map((g, i) => (
  <polyline
    key={`quant-link-${i}`}
    points={g.map((p) => `${xScale(p.avgTokPerSec)},${yScale(p.passRate)}`).join(' ')}
    fill="none"
    stroke="rgb(var(--fg-muted))"
    strokeWidth={1}
    strokeLinecap="round"
    opacity={0.3}
    className="pointer-events-none"
  />
))}
```

**Emphasis decision**: connector is *solid, thin (1px), neutral fg-muted, opacity 0.3*; the Pareto frontier stays *dashed (6 5), accent-colored, 1.5px, opacity 0.6*. Solid-vs-dashed + neutral-vs-accent + under-vs-over gives three redundant cues, so the connector reads as background annotation and never competes with the frontier. One sentence appended to the header copy (:385-391): "A thin grey line links quantizations of the same base model."

---

## Implementation order

1. `model-id-parse.ts` (pure, no deps)
2. `discovery-direct.ts` metadata fields + Ollama passthrough + LM Studio enrich hook
3. `quant-ab.ts` (imports only model-id-parse)
4. `quant-ab-panel.tsx` + `multi-bench-panel.tsx` toggle
5. `quality-speed-chart.tsx` connectors
6. `tsc -b && vite build` (CI parity)

No new runtime deps. No storage migrations (all new fields optional; IDB stays v1). YAML/case editor untouched.


## RISKS
- Parser false merges/misses: unusual ids (finetunes, imatrix 'i1' markers, MLX repos) may group wrongly or not at all — mitigated by conservative noise-token list (only instruct/it/chat/gguf/hf) and the 16-vector spec, but the vocabulary will need maintenance; a wrong merge produces a misleading delta table.
- Statistical power: at n=100 cases the Wilson 95% CI is ~±6-7pp, so 'degrades' will rarely fire for small real quality drops — the CI column and copy must make clear 'holds' means 'not distinguishable at this suite size'.
- Cross-session comparisons are noisy: parameterized cases re-randomize per Start (local-models-shell.tsx:228), so variants benched in different sessions saw different concrete inputs — surfaced via the crossSession warning but users may still over-read deltas.
- Assumed FP16 for bare vLLM ids is wrong when the server was launched with --quantization; flagged '(assumed)' in the UI but the baseline pick could be incorrect.
- LM Studio /api/v0/models enrichment can fail on older versions or stricter CORS — handled best-effort (quant falls back to 'unknown'), and it adds one extra GET per successful LM Studio probe.
- Old history records (IDB v1) lack model.quant/paramSize, so Ollama default pulls like 'qwen2.5:14b' from history parse as quant=null → 'unknown', weakening baseline selection for historical A/Bs.
- Chart clutter: many groups produce many grey connectors; opacity 0.3 + 1px keeps them subordinate, but a dense multi-group chart may still need a future toggle to hide links.
- No test runner exists — the 16 parser vectors are documentation/ad-hoc-runnable only until vitest (or similar) is introduced, so regressions in the regexes won't be caught by CI.

## CRITIQUE (needs-changes)
- [major] Spurious A/B groups from 'unknown' quant labels. Group admission counts 'unknown' as a distinct effective quant, so an old IDB-v1 history run of 'qwen2.5:14b' (no model.quant field -> 'unknown') plus a fresh run of the exact same model (Ollama metadata -> 'Q4_K_M') yields 2 entries with 2 'distinct' labels -> an admitted group whose delta table compares a model against itself and can emit a 'degrades' verdict from pure run-to-run noise. Same trap for vLLM 'FP16 (assumed)' vs an 'unknown' from another engine. QuantRunInput also lacks port/host, so the panel cannot even detect that two variants are the same endpoint.
  FIX: Add modelKey (or host+port) to QuantRunInput; in buildQuantGroups treat variants sharing modelKey as re-runs (keep latest or fold), and do not count 'unknown' toward the >=2-distinct-labels admission rule ('unknown' variants may still display inside an already-admitted group, but never create one).
- [major] Params-key mismatch between id-parsed size and metaParamSize fallback silently splits legitimate groups. Ollama /api/tags parameter_size is usually non-integer ('14.8B' for qwen2.5:14b, '1.2B' for llama3.2:1b, '9.2B' for gemma2:9b); the design's normalization only strips trailing '.0'. So 'qwen2.5:latest' (parsed params null -> meta '14.8B' -> '14.8b') never groups with 'qwen2.5:14b-instruct-fp16' (parsed '14b') — the headline default-pull-vs-explicit-quant use case shows the empty state with no error, and whether it works depends on which model family you picked (llama3.1 '8.0B' works, qwen2.5 doesn't).
  FIX: Group by base first, then resolve param buckets: entries with only metaParamSize join the parsed-token bucket whose numeric value is nearest within ~20% (14.8 -> '14b'); only fall back to the raw meta string when no parsed bucket exists. This requires computing keys over the whole run list, which dovetails with the fix below.
- [major] Chart quantLinks bypasses group admission: it links any >=2 points sharing groupKey (quant-agnostic), so two re-runs of the identical model — the palette comment at quality-speed-chart.tsx:43-48 says multi-run-per-model is the expected workflow — get a grey connector, directly contradicting the new header copy 'links quantizations of the same base model'. Two same-quant re-runs plus filtering/dedup are handled in buildQuantGroups but not here.
  FIX: Replace per-run groupKeyForRun with a run-list-level export from quant-ab.ts (e.g. computeQuantLinks(inputs): Map<runId, groupKey|null> or reuse buildQuantGroups) that applies the same admission rule (>=2 distinct non-'unknown' effective quants, modelKey dedupe) and yields one representative point per quant; the chart memo consumes that instead of grouping raw points.
- [minor] The LM Studio enrich hook signature has no AbortSignal: probeOneFromSpec's fetch is bounded by the 1500 ms timer (discovery-direct.ts:396-402), but the extra GET /api/v0/models inside enrich is un-abortable, so one hung LM Studio response delays the entire discoverDirect Promise.all until the browser's own timeout.
  FIX: Add signal: AbortSignal as an enrich parameter and pass the probe's AbortController signal through; keep the existing try/catch-returns-models-unchanged behavior.
- [minor] quant-ab-panel.tsx references fmtClockShort, but that helper is module-private in multi-bench-panel.tsx:410 and independently duplicated in quality-speed-chart.tsx:845 — the design doesn't say where the panel gets it, and importing from multi-bench-panel would require a new export (and creates a value-level cycle since multi-bench-panel imports QuantAbPanel).
  FIX: State explicitly that quant-ab-panel.tsx carries its own private fmtClockShort copy (matching the existing duplication pattern), and keep the ModelRunState import as `import type` to avoid a runtime cycle.
- [minor] QuantAbPanel filters only on summary !== null, but BenchSummary.avgTokPerSec is number|null (bench-direct.ts:113, null when every case timed out); the 'Avg tok/s' column spec ('value + (1.8x)') has no null rendering, and a baseline with null tok/s nulls every variant's speedup.
  FIX: Specify em-dash rendering for null avgTokPerSec cells and null speedup (speedup is already typed nullable in QuantVariant, so this is display-spec only).