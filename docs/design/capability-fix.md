# Design: engine-truth capability detection (fix "vision/tool cases never run")

Root cause confirmed: `local-models-shell.tsx:292` calls `inferCapabilities(m.id)` and passes the result to `runBenchDirect` as `modelCapabilities`; `capabilityMissing()` (bench-direct.ts:425) then records skipped rows. The regexes in `capabilities.ts:42-67` miss real tags (`qwen2.5vl`, `gemma3`, `llama4`, `mistral-small3.1`, `gpt-oss`, …), so `requires`-gated cases silently skip with `skipReason: "lacks vision capability"`.

## Decision 1 — new module `engine-metadata.ts` (not extend engine-defaults.ts)

`engine-defaults.ts` is the gear-modal "pull sampling defaults" flow (on-demand, per model, returns `PulledDefaults`). Capability metadata has a different lifecycle (discovery-time, all models, merged into the model object), so it gets its own self-contained module with a header comment, matching repo style. The small Ollama `/api/show` fetch duplication with `pullOllama` is acceptable and keeps both modules independent.

**New file `src/components/local-models/engine-metadata.ts`:**

```ts
import { readApiKey } from './auth-store';
import type { EngineCapabilityFlags, ModelEngineMeta } from './capabilities';
import type { DiscoveredLocalModel } from './discovery-direct';

const META_TIMEOUT_MS = 2500;

/** Engine-truth metadata for one model. Never throws — returns null on any failure. */
export async function fetchEngineMeta(
  model: DiscoveredLocalModel,
  opts?: { readonly timeoutMs?: number },
): Promise<ModelEngineMeta | null>;

/** Best-effort parallel enrichment; models whose fetch fails pass through unchanged. */
export async function enrichModelsWithEngineMeta(
  models: readonly DiscoveredLocalModel[],
  opts?: { readonly timeoutMs?: number },
): Promise<readonly DiscoveredLocalModel[]>;
```

Per-engine behavior inside `fetchEngineMeta` (each request wrapped in AbortController + timeout, `authHeaders` copied from engine-defaults.ts:86 pattern):

- **Ollama** — `POST {base}/api/show` body `{ name: model.id }` (base = `chatBaseUrl.replace(/\/v1\/?$/, '')`). Parse:
  ```ts
  const body = await res.json() as {
    capabilities?: string[];
    details?: { family?: string; parameter_size?: string; quantization_level?: string };
  };
  ```
  When `Array.isArray(body.capabilities)`: set ALL four flags — `vision: caps.includes('vision')`, `toolUse: caps.includes('tools')`, `reasoning: caps.includes('thinking')`, `embedding: caps.includes('embedding')` (Ollama's array is authoritative; values as of 2026: `completion|vision|tools|thinking|embedding|insert`). Map `details.quantization_level → quantization`, `details.family → family`, `details.parameter_size → parameterSize`.
- **LM Studio** — `GET {base}/api/v0/models/{encodeURIComponent(id)}`. Parse `{ type?: 'llm'|'vlm'|'embeddings'; arch?: string; quantization?: string; capabilities?: string[] }`. When `capabilities` array present (LM Studio ≥0.3.x): `toolUse: caps.includes('tool_use')`, `vision: caps.includes('vision')`; leave `reasoning` **absent** (LM Studio doesn't report it → heuristic fallback). Independently: `type === 'vlm' → vision: true`, `type === 'embeddings' → embedding: true`, `type === 'llm' → embedding: false`. Map `quantization`, `arch`.
- **llama.cpp** — `GET {base}/props`, parse `{ modalities?: { vision?: boolean } }` (present since the 2025 mtmd merge): when the field exists set `vision`; everything else absent → heuristics.
- **vLLM** — return `null` (nothing exposed over HTTP); heuristics only.

## Decision 2 — types live in `capabilities.ts`; `DiscoveredLocalModel.meta`

Putting `ModelEngineMeta` in `capabilities.ts` keeps that module pure/node-importable and avoids an import cycle (discovery-direct ↔ engine-metadata).

**Add to `capabilities.ts`:**

```ts
/** Per-field flags as reported by the engine. Absent field = engine didn't say. */
export interface EngineCapabilityFlags {
  readonly vision?: boolean;
  readonly toolUse?: boolean;
  readonly reasoning?: boolean;
  readonly embedding?: boolean;
}

/** Engine-truth model metadata attached to a discovered model post-scan. */
export interface ModelEngineMeta {
  readonly capabilities?: EngineCapabilityFlags;
  readonly quantization?: string;   // "Q4_K_M", "4bit"
  readonly arch?: string;           // LM Studio arch, e.g. "qwen2_vl"
  readonly family?: string;         // Ollama details.family
  readonly parameterSize?: string;  // Ollama details.parameter_size, e.g. "7.6B"
}

export type CapabilitySource = 'engine' | 'inferred';

export interface ResolvedCapabilities extends InferredCapabilities {
  /** 'engine' when at least one capability flag came from the engine. */
  readonly source: CapabilitySource;
}

/** Merge: engine value wins per-field WHEN PRESENT; absent field falls back to name heuristics. */
export function resolveCapabilities(
  modelId: string,
  meta?: ModelEngineMeta,
): ResolvedCapabilities {
  const inferred = inferCapabilities(modelId);
  const eng = meta?.capabilities;
  if (eng === undefined) return { ...inferred, source: 'inferred' };
  return {
    vision: eng.vision ?? inferred.vision,
    toolUse: eng.toolUse ?? inferred.toolUse,
    reasoning: eng.reasoning ?? inferred.reasoning,
    embedding: eng.embedding ?? inferred.embedding,
    source: 'engine',
  };
}
```

**`discovery-direct.ts:34`** — add to `DiscoveredLocalModel` (import type from `./capabilities`):

```ts
  /** Engine-truth metadata (capabilities, quant, arch). Populated by a
   *  best-effort post-scan enrichment pass; absent on vLLM, on fetch
   *  failure, and on model objects hydrated from pre-meta stored runs. */
  readonly meta?: ModelEngineMeta;
```

`buildModel` itself does NOT change — enrichment happens post-discovery in the shell, so probe parsing stays untouched. Backward compat is automatic: field is optional, so IDB v1 `StoredRun.model` objects without `meta` hydrate fine, and new records carry a plain structured-cloneable object. `modelKey` (source::id::port) unchanged → selection set survives the model-object replacement.

## Decision 3 — when it runs: post-scan enrichment in `startScan`

`local-models-shell.tsx:150-168` — keep UI snappy: publish the raw scan immediately, enrich in the background, publish again. Guard staleness with a sequence ref:

```ts
const scanSeqRef = useRef(0);

const startScan = useCallback(async (hostsForScan: readonly string[]) => {
  const seq = ++scanSeqRef.current;
  setPhase('scanning');
  setScan(null);
  try {
    const r = await discoverDirect({ extraHosts: hostsForScan });
    if (seq !== scanSeqRef.current) return;
    setScan(r);
    setSelectedKeys(/* unchanged auto-pick */);
    setPhase('ready');
    // Best-effort engine-truth enrichment; chips + capability gate update when it lands.
    const enriched = await enrichModelsWithEngineMeta(r.models);
    if (seq !== scanSeqRef.current) return;
    setScan((prev) => (prev === null ? prev : { ...prev, models: enriched }));
  } catch { if (seq === scanSeqRef.current) setPhase('error'); }
}, []);
```

`enrichModelsWithEngineMeta` = `Promise.all` over models (all localhost; no concurrency cap needed), each with its own 2500 ms timeout; a failed/null fetch returns the model unchanged. `selectedList` (:196) derives from `scan.models`, so `startBench` automatically sees `meta`. Edge case: Start clicked before enrichment lands → heuristics used, same as today — acceptable (enrichment completes in <1 s locally).

**`startBench` change at :292:**

```ts
const caps = resolveCapabilities(m.id, m.meta);
const res = await runBenchDirect({
  ...
  modelCapabilities: { toolUse: caps.toolUse, vision: caps.vision, source: caps.source },
```

## Decision 4 — widened heuristics (`capabilities.ts`)

Keep the same single-function regex style; replace the three chat regexes. `\b` fails across digit→letter joints (`qwen2.5vl`), hence explicit spellings. Real tag spellings covered (Ollama left, LM Studio right where they differ):

```ts
  // Vision / multimodal markers.
  const vision =
    /(vision|llava|bakllava|moondream|minicpm-v|minicpm-o|qwen2\.5vl|qwen2[\.-]5-vl|qwen2-vl|qwen3-?vl|internvl|cogvlm|smolvlm|pixtral|paligemma|florence|janus|magma|idefics|glm-?4\.?[15]?v|phi-?4-?multimodal|mistral-small3\.[12]|llama-?4|llama3\.2-vision|granite3\.[23]-vision|granite-vision/.test(id) ||
    /gemma-?3(?!n)(?![\w.]*(?:270m|1b))/.test(id) ||
    id.includes('-vl-') || id.endsWith('-vl') || /(^|[^a-z0-9])vl([^a-z0-9]|$)/.test(id);

  // Reasoning families.
  const reasoning =
    /(reasoning|thinking|qwq|deepseek-r1|gpt-oss|magistral|exaone-deep|phi-?4-(?:mini-)?reasoning|openthinker|smallthinker|glm-z1|cogito|o1|o3-)/.test(id) ||
    /qwen-?3(?!-vl)/.test(id) ||
    id.includes('-r1-') || id.includes('-r1.') || id.endsWith('-r1');

  // Tool-use families.
  const toolUse =
    /(qwen|llama-?[34]|llama3|mistral|ministral|mixtral|devstral|gemma|phi-?4|nemotron|granite|hermes|deepseek|glm-?4|kimi|minimax|smollm2|functionary|firefunction|command-[ra]|aya-expanse|seed-oss|yi-|cohere|tulu|solar)/.test(id) || reasoning;
```

Also add to the embedding short-circuit (:35): `all-minilm|minilm|paraphrase-|reranker`. Drop the leading `\b` group form where it blocks matches (`\b(vl|…)` → the alternation above; false-positive risk of bare `vl` handled by the explicit non-alphanumeric-delimited test). Note: `gemma3` heuristic excludes text-only `:270m`/`:1b` tags and `gemma3n`; Ollama engine truth overrides either way. gemma stays in toolUse for LM Studio parity even though Ollama reports no `tools` for gemma3 — engine truth corrects it there.

## Decision 5 — UI surfacing

**Skip reason (already rendered).** Verified: `bench-table.tsx:317` prints `skipped — {skipReason}` in the evaluator column and `:443-444` in the detail row. Improve the runner string:

- `bench-direct.ts:216` — extend option type:
  ```ts
  readonly modelCapabilities?: {
    readonly toolUse: boolean;
    readonly vision: boolean;
    /** Where the flags came from — drives the skip-reason wording. */
    readonly source?: 'engine' | 'inferred';
  } | null;
  ```
- `capabilityMissing` (:425) stays as is; the skip row at :298 becomes:
  ```ts
  skipReason: `lacks ${missing} capability (${opts.modelCapabilities?.source === 'engine' ? 'engine-reported' : 'inferred from model name'})`,
  ```

**Model card verified state.**
- `capability-chip.tsx` — add prop: `export function CapabilityChip({ kind, verified }: { kind: CapabilityKind; verified?: boolean })`. When `verified`, append a 3×3 check glyph inside the pill and set `title="Reported by the engine"`; otherwise `title="Inferred from model name"`.
- `model-grid.tsx:93-103` — replace `inferCapabilities(m.id)` with `resolveCapabilities(m.id, m.meta)`; pass `verified={caps.source === 'engine'}` to each chip. Add metadata chips next to the ctx chip using the existing local `Chip`: `{m.meta?.quantization ? <Chip>{m.meta.quantization}</Chip> : null}{m.meta?.parameterSize ? <Chip>{m.meta.parameterSize}</Chip> : null}`.

## Task 5 verification — vision payload & tool_call capture (read from bench-direct.ts)

**Vision payload: CORRECT.** `streamCompletion` (:553-562) sends the OpenAI content-array shape `[{type:'text',text}, {type:'image_url', image_url:{url: c.image.dataUrl}}]` only when the case has an image. All four engines' `/v1/chat/completions` compat layers accept `image_url` with **base64 data URLs** (Ollama's compat layer translates data URLs to its native `images` field internally — no change needed since we always go through `/v1`; llama.cpp mtmd, LM Studio, vLLM all accept it). Caveat: Ollama's compat layer rejects **remote http(s)** image URLs — not an issue today because `InlineCase.image` is `{dataUrl}` only, but worth a comment if URL images are ever added.

**Tool-call capture: CORRECT.** :695-712 follows the OpenAI streaming contract — per-`index` slot map, `id`/`name` taken from whichever chunk carries them, `function.arguments` fragments concatenated, missing `index` defaults to 0, `freezeToolCalls` sorts by index. TTFT is also set on tool-call deltas (:709). Two minor flags, no code change required: (a) `tool_choice: 'auto'` is sent explicitly (:620) — Ollama's compat layer ignores unknown/unsupported fields, so harmless, and it fixes older vLLM defaults as the comment says; (b) models whose chat template emits tool calls as plain text (engine parser absent) land in `content`, which is an evaluator concern, not a capture bug.

## Files to change (complete list)

1. `src/components/local-models/capabilities.ts` — widened regexes; add `EngineCapabilityFlags`, `ModelEngineMeta`, `CapabilitySource`, `ResolvedCapabilities`, `resolveCapabilities()`.
2. `src/components/local-models/engine-metadata.ts` — **NEW**: `fetchEngineMeta`, `enrichModelsWithEngineMeta`.
3. `src/components/local-models/discovery-direct.ts:34` — add optional `meta?: ModelEngineMeta` to `DiscoveredLocalModel`.
4. `src/components/local-models/local-models-shell.tsx` — `:150` startScan enrichment + `scanSeqRef`; `:292-298` `resolveCapabilities(m.id, m.meta)` + pass `source`.
5. `src/components/local-models/model-grid.tsx:94` — `resolveCapabilities`, `verified` prop, quant/paramSize chips; update header comment (:8).
6. `src/components/local-models/capability-chip.tsx` — optional `verified` prop (check glyph + tooltips).
7. `src/components/local-models/bench-direct.ts` — `:216` option type gains `source?`; `:298` skip-reason wording; comment at :210 updated ("per capabilities.ts resolution, engine-truth when available").

No new runtime deps; no IDB migration (DB_VERSION stays 1); YAML/case formats untouched; `tsc -b && vite build` is the only gate.


## RISKS
- Enrichment lands after the user clicks Start (race): that run still uses name heuristics — same behavior as today, so no regression, but a fast-clicking user may still see gated skips once per fresh scan.
- LM Studio capabilities array only exists on ≥0.3.x; older builds fall back to type-based vision detection and name heuristics for tool-use — gemma-family tool support may still be misreported there.
- Ollama reports no 'tools' capability for some models that can actually emit tool-call text (and vice versa for template-less GGUF imports); engine truth is authoritative by design, so such models will now be skipped with an 'engine-reported' reason — arguably correct but a behavior change users may notice.
- Widened heuristics (notably gemma3-minus-1b/270m and bare 'vl' token) accept some false positives on vLLM/llama.cpp where no engine truth exists — a wrongly-claimed vision model will now RUN the vision cases and fail them instead of skipping (visible failures rather than silent skips; intended trade-off).
- N parallel /api/show POSTs per scan against Ollama briefly spike request volume on hosts with many models; each is timeout-capped at 2.5 s and failures are swallowed, but a slow remote host delays chip verification.
- gemma3n and future multimodal families not in the heuristic list stay vision=false on engines without capability reporting until the list is next updated.
- Ollama compat layer would reject remote http(s) image URLs if case images ever move beyond data URLs — flagged in code comment only, no guard added.

## CRITIQUE (needs-changes)
- [major] Decision 4's gemma3 size-exclusion lookahead is non-functional: in /gemma-?3(?!n)(?![\w.]*(?:270m|1b))/ the class [\w.] matches neither ':' (Ollama tags) nor '-' (LM Studio ids), so the lookahead can never see the size suffix. 'gemma3:1b', 'gemma3:270m', and 'gemma-3-1b-it' all get vision=true. On Ollama engine truth eventually overrides, but on the pre-enrichment Start race, and permanently on llama.cpp/vLLM/older LM Studio, text-only gemma3 1b models will RUN all vision cases and fail them — exactly the noise the exclusion was written to prevent, and gemma3:1b is one of the most-pulled Ollama tags.
  FIX: Include the separators in the scan class: /gemma-?3(?!n)(?![-:\w.]*(?:270m|1b)\b)/ (verify against 'gemma3:12b' — it must stay vision=true; it does, since '1b' never appears as a literal substring there... it appears in '12b' only as '2b'; add a unit-style comment with the four tag spellings tested).
- [major] resolveCapabilities' single coarse source ('engine' when ANY flag came from the engine) produces false provenance claims on partially-reporting engines. llama.cpp /props reports only modalities.vision; LM Studio <0.3.x only type. With the design as written, a tool_use-required case skipped on llama.cpp gets skipReason '…(engine-reported)' and the Tool Use chip in model-grid gets verified={true} with title 'Reported by the engine' — both false, since toolUse was name-inferred. This undermines the exact trust signal the feature exists to create.
  FIX: Make provenance per-field: ResolvedCapabilities carries readonly sources: Readonly<Record<'vision'|'toolUse'|'reasoning'|'embedding', CapabilitySource>> (field is 'engine' only when eng.<field> !== undefined). Pass sources.vision/sources.toolUse into RunBenchOptions.modelCapabilities (e.g. sources?: { toolUse: 'engine'|'inferred'; vision: 'engine'|'inferred' }) and pick the skip-reason wording from the source of the specific missing capability; in model-grid pass verified={caps.sources[kind] === 'engine'} per chip.
- [minor] LM Studio engine-truth path is likely dead for most real models: LM Studio ids are typically namespaced with a slash ('qwen/qwen2.5-vl-7b') and the design (copying engine-defaults.ts:188) builds GET {base}/api/v0/models/{encodeURIComponent(id)}, encoding '/' as %2F. If LM Studio's router does not decode %2F in path segments the request 404s, fetchEngineMeta silently returns null, and every namespaced LM Studio model permanently falls back to heuristics — making Decision 1's whole LM Studio branch a no-op without any visible error.
  FIX: Verify against a live LM Studio before shipping; if %2F fails, build the path without encoding the slash (encode each path segment separately: id.split('/').map(encodeURIComponent).join('/')). Apply the same fix opportunistically to pullLmStudio in engine-defaults.ts or note it as a known-shared behavior.
- [minor] Decision 4's vision regex literal is syntactically invalid — the group opened after the leading '/' is never closed ('…|granite-vision/.test(id)' is missing the ')' before the closing '/'). As written it is a SyntaxError; tsc catches it, but the design presents it as exact code to paste.
  FIX: Close the group: '…|granite3\.[23]-vision|granite-vision)/.test(id)'.
- [minor] The widened reasoning regex drops the original \b delimiters and includes bare 'o1' as a plain substring alternative: /(…|o1|o3-)/. Any model id containing the substring 'o1' anywhere is flagged reasoning=true, and because toolUse is '… || reasoning' it also gains tool-use — so a false positive un-skips tool_call cases on engines without capability reporting. Current heuristic at capabilities.ts:54 deliberately used \b(…|o1|o3-)\b.
  FIX: Keep 'o1' delimiter-guarded like the design already does for bare 'vl': move it out of the big alternation into /(^|[^a-z0-9])o1([^a-z0-9]|$)/.test(id) (marco-o1 etc. still match via the '-o1' joint).
- [minor] Decision 3 replaces only scan.models with enriched copies while scan.probes[*].models keeps the pre-enrichment objects, and any model object already captured by open UI (model-config-modal held in shell state, in-flight sessionEntries snapshot) stays stale. Today probes[*].models is only counted (probe-status.tsx:174) and the modal doesn't read capabilities, so nothing breaks — but the design should state that scan.models is the single source of truth for meta so a future consumer of probes[*].models or the modal doesn't read the un-enriched twin.
  FIX: Add one sentence to Decision 3 (and a comment at the setScan merge site) declaring scan.models authoritative post-enrichment; optionally also map probes' model arrays through the same enrichment lookup by modelKey since it is a cheap in-memory join.