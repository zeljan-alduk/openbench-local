# Trends-over-time view — design

## 0. Data flow (key insight)

`local-models-shell.tsx:119-148` already hydrates **all** IDB history (`getAllRuns()` → `storedToRunState`) into the in-memory `runs: ModelRunState[]` on mount, and history-dialog deletions sync back via `onRunsDeleted`. So the trend view does **not** need its own `getAllRuns()` call: the `runs` prop that `MultiBenchPanel` already receives *is* the full history, kept live. `ModelRunState` (multi-bench-panel.tsx:40-64) already carries `runId`, `sessionId`, `startedAt`, `finishedAt`, `runConfig`, `summary` — everything needed.

## 1. Series identity — DECISION: modelKey + params fingerprint

**Series key** = `modelKey(model)` (selection.ts:14, `source::id::port`) + `'||'` + `paramsFingerprint(runConfig)`.

The fingerprint is a **canonical readable string**, not an opaque hash: sorted `key=value` fragments for exactly the quality-affecting params — `temperature`, `topP`, `seed`, `reasoningEffort`, `repeatCount` (only when >1), `maxTokens`, and `sys=<djb2>` for a non-empty `systemPrompt` (hashed because prompts are long). Params left `undefined` are omitted, so the all-defaults config fingerprints to `''` and the series key degrades to plain `modelKey` — old runs with `runConfig: {}` (legacy migration writes exactly that, history-store.ts:271) all land in one clean series. Excluded: `warmUp`, `caseTimeoutMs` (operational knobs, not sampling knobs — see risks).

**Why variants beat modelKey-only + param-change markers:**
- A temp 0→0.8 or reasoning off→high change moves pass-rate for reasons that are *not* model/setup drift; folding both into one line makes the trend chart assert a regression that didn't happen. Markers force the user to mentally split the line; variants split it for them.
- Markers break down under A/B alternation (temp=0 run, temp=0.8 run, temp=0 run…) — one line would zigzag with a marker at every point. Variants render as two clean parallel lines, which is exactly the comparison the user is running.
- Variants reuse existing machinery for free: `colourFor(seriesKey)` gives each variant a stable colour, and the legend-chip/exclude-filter idioms from quality-speed-chart.tsx work unchanged on series keys.
- Cost (series proliferation while knob-fiddling) is mitigated by: legend groups variants under the model id with the params suffix, and per-series hide toggles.

## 2. Placement — DECISION: MultiBenchPanel, new chart tab

**Not** history-dialog: it's a cramped 880px modal built for pruning; a trend chart needs persistent space, hover room, coexistence with the scatter, and — decisively — click-to-scroll targets (`ModelSection`s) that only exist on the main page. Also the dialog re-fetches IDB on every open; the panel gets live data via props.

Implementation in `multi-bench-panel.tsx`:
- Add alongside the existing `view` state (:73): `const [chartTab, setChartTab] = useState<'compare' | 'trends'>('compare');`
- Inside the `showCompare` block (:78-92), render a `ToggleBtn` pair (reuse the existing `ToggleBtn` at :107) — "This comparison" | "Trends over time" — then `chartTab === 'compare' ? <QualitySpeedChart runs={runs}/> : <TrendChart runs={runs} onSelectRun={scrollToRun}/>`. `ComparisonStrip` stays always-on above the tabs. Note `showCompare` (`runs.length >= 2`) is the right gate: hydration means 2+ historical runs of even a single model satisfies it.
- `scrollToRun(runId)`: `setView('by-model')` then `document.getElementById(\`run-${runId}\`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. Give `ModelSection`'s `<section>` (:333) `id={\`run-${run.runId}\`}`.

## 3. New pure module — `src/components/local-models/trend-series.ts` (~160 ln)

Node-importable (type-only imports), so it slots straight into the future test workstream.

```ts
import type { BenchSummary, RunConfig } from './bench-direct';
import type { DiscoveredLocalModel } from './discovery-direct';

/** Structural subset of ModelRunState the trend math needs. */
export interface TrendRunInput {
  readonly runId: string;
  readonly sessionId: string;
  readonly finishedAt: number | null;
  readonly model: DiscoveredLocalModel;
  readonly runConfig: RunConfig;
  readonly summary: BenchSummary | null;
  readonly origin?: 'imported';           // Phase 3 forward-compat; absent = local
}

export interface TrendPoint {
  readonly runId: string;
  readonly sessionId: string;
  readonly finishedAt: number;
  readonly passed: number;
  readonly total: number;                 // n — shown on tooltip
  readonly passRate: number;              // 0..1
  readonly ciLo: number;                  // Wilson 95%
  readonly ciHi: number;
  readonly avgTokPerSec: number | null;
  readonly p95LatencyMs: number;
  readonly imported: boolean;
}

export interface TrendSeries {
  readonly seriesKey: string;             // `${modelKey}||${fingerprint}`
  readonly modelKey: string;              // source::id::port
  readonly modelId: string;
  readonly source: string;
  readonly paramsLabel: string;           // '' for default config, else 'temp=0.8 · reason=high · ×3'
  readonly modalTotal: number;            // most common `total` in this series — suite-drift baseline
  readonly points: readonly TrendPoint[]; // sorted by finishedAt asc
}

/** Canonical quality-affecting-params string; '' when all defaults. */
export function paramsFingerprint(c: RunConfig): string;
/** Human label for legend/tooltip; same fields, ' · '-joined, formatKeyParams style. */
export function paramsLabel(c: RunConfig): string;

/** 95% Wilson score interval; {lo:0, hi:1} when total === 0. */
export function wilsonInterval(passed: number, total: number, z?: number): { lo: number; hi: number };
// centre=(p+z²/2n)/(1+z²/n); half=z·sqrt(p(1-p)/n + z²/4n²)/(1+z²/n); clamp [0,1]

/**
 * Group finished runs (finishedAt !== null && summary !== null && summary.total > 0)
 * into series, drop everything else, sort points by finishedAt asc,
 * sort series by modelId then paramsLabel for stable legend order.
 */
export function buildTrendSeries(runs: readonly TrendRunInput[]): readonly TrendSeries[];

/**
 * Nice time ticks: pick step from ladder [5m,15m,1h,3h,6h,12h,1d,2d,7d,14d,30d]
 * targeting ~6 ticks, aligned to local hour/day boundaries. Label granularity:
 * span < 24h → 'HH:MM'; < 90d → 'Jun 12'; else 'Jun'. First tick of a new day
 * within an hour-scale axis gets the date prepended.
 */
export function niceTimeTicks(minMs: number, maxMs: number): readonly { t: number; label: string }[];
```

`ModelRunState` is structurally assignable to `TrendRunInput`, so `MultiBenchPanel` passes `runs` through untouched.

## 4. New shared module — `src/components/local-models/chart-palette.ts` (~60 ln)

Extract verbatim from quality-speed-chart.tsx and export: `PALETTE` (:49-74), `colourFor` (:88-92), `shortId` (:95-97), `SOURCE_LABELS` (:75-80), `fmtClockShort` (:845-850). Edit quality-speed-chart.tsx to import these and delete the local copies (zero behavioural change; colours stay keyed by `runId` there). TrendChart colours by `colourFor(series.seriesKey)`.

## 5. New component — `src/components/local-models/trend-chart.tsx` (~450 ln)

```ts
interface Props {
  readonly runs: readonly ModelRunState[];       // full history, via MultiBenchPanel
  /** Switch to by-model view and scroll that run's section into view. */
  readonly onSelectRun?: (runId: string) => void;
}
export function TrendChart({ runs, onSelectRun }: Props): JSX.Element | null;
```

Internal state: `metric: 'passRate' | 'tokps'` (ToggleBtn pair in header — DECISION: toggle, not small-multiple; one plot keeps the CI band readable and halves the SVG); `hover: { series: TrendSeries; point: TrendPoint } | null`; `hidden: ReadonlySet<string>` of seriesKeys (legend-chip click toggles, mirroring the scatter's RunFilter semantics).

Layout: same constants idiom — `W=880, H=380, PAD_L=64, PAD_R=32, PAD_T=28, PAD_B=56`; `viewBox`-scaled responsive `<svg>`, plot frame `<rect>`, gridline + tick pattern copied from quality-speed-chart.tsx:441-497.

Scales:
- `x`: time. Domain `[min finishedAt, max finishedAt]` over visible points, padded 2% each side; degenerate single-timestamp domain → pad ±30 min. Ticks via `niceTimeTicks`.
- `y` (passRate): fixed 0..1, ticks at 25% like the scatter (`yScale(rate) = PAD_T + (1-rate)*PLOT_H`).
- `y` (tokps): 0..`max*1.12`, 5 even ticks (scatter's x-axis recipe rotated).

Per visible series, in paint order:
1. **Wilson CI band** (passRate metric only, series with ≥2 points): one closed `<path>` — upper bound left→right then lower bound right→left, `fill={color}` `fillOpacity={0.12}` `stroke="none"` `className="pointer-events-none"`.
2. **Line**: `<polyline>` through points, `stroke={color}` `strokeWidth={1.5}` `fill="none"` (frontier-polyline idiom, quality-speed-chart.tsx:519-531). Skipped for single-point series.
3. **Points**: visual `<circle r={3.5}>` fill colour, white `bg-elevated` stroke — plus, per point, a transparent hit `<circle r={10}>` with `onMouseEnter/onMouseLeave/onFocus/onBlur/tabIndex={0}` (scatter dot idiom :560-575) and `onClick={() => onSelectRun?.(p.runId)}` `cursor-pointer`. Single-point series (passRate metric) additionally get a vertical CI whisker `<line>` from `yScale(ciHi)` to `yScale(ciLo)`.
   - **Suite-drift marker**: point where `p.total !== series.modalTotal` renders hollow (fill `bg-elevated`, stroke colour, strokeWidth 2).
   - **Imported marker**: `p.imported` renders as a rotated square (`<rect transform="rotate(45 …)">`) instead of a circle.
4. On hover: hovered series' line/band at full opacity, others dimmed to 0.25 (text-label opacity idiom :597); hovered point r grows +2.

**Tooltip**: same absolute-positioned percent-anchored card as scatter's `Tooltip` (:669-733), with horizontal flip past 65%. Contents: model id, `SOURCE_LABELS[source] · displayBaseUrl`, `paramsLabel` (when non-empty), finished date+time, `passed / total` with explicit `n=…` (and an amber `differs from usual n=modalTotal` note when suite drifted), `passRate% (CI lo–hi%)`, avg tok/s, p95 latency, amber `imported` badge when applicable, and a `click → jump to run` hint when `onSelectRun` provided.

**Legend**: chip-per-series reusing the scatter legend chip markup (:399-419): colour dot + `shortId(modelId)` + muted `paramsLabel` suffix + `(N)` point count; click toggles the series in `hidden`; hidden chips render at opacity 50 with line-through. Chips grouped by model id so variants sit adjacent (series sort order already guarantees this).

**Gates / edge cases**:
- Return `null` when total plottable points < 2 (mirrors the scatter's <2 rule).
- `metric='tokps'`: drop points with `avgTokPerSec === null`; no band, plain line + dots.
- Runs with `summary === null` (errored) or `finishedAt === null` never become points (filtered in `buildTrendSeries`).
- Suite composition change between runs: **do not filter** — annotate (hollow marker + tooltip n-note). Wilson band already widens honestly for small n, and pass-rate keeps points comparable; filtering to equal-n would silently hide history. `modalTotal` (mode of `total` per series) is the drift baseline.
- Same `finishedAt` collisions: sort ties by `runId` for deterministic polylines.

**Perf** (hundreds of runs): `buildTrendSeries` is O(R log R), memoised with `useMemo` on `runs` (the shell replaces the array immutably, so reference equality works). DOM cost ≈ 2 circles per point + 2 paths per series → ~500 runs ≈ 1.1k SVG nodes, well within budget; no virtualisation needed. No mousemove-driven nearest-point math — hit circles keep hover O(1). The a11y `sr-only` table (scatter :642-664) is reproduced with one row per point capped at the 100 most recent to bound DOM size.

## 6. Storage changes — nothing required

Everything derives from existing `StoredRun` fields (`finishedAt`, `summary.{passed,total,passRate,avgTokPerSec,p95LatencyMs}`, `runConfig`, `model`). Two zero-cost forward-compat touches:
- `history-store.ts:34`: add `readonly origin?: 'imported';` to `StoredRun` and pass it through `storedToRunState` (:199) into the returned object. IDB is schemaless per-value — **no DB_VERSION bump**, old records simply lack the field and read as local. Phase 3's importer sets it.
- No pre-aggregation, no new store, no index (we already read via `getAll()` and the shell holds it in memory).

## 7. File-by-file change list

| File | Change |
|---|---|
| `src/components/local-models/trend-series.ts` | NEW — types + `buildTrendSeries` + `wilsonInterval` + `paramsFingerprint`/`paramsLabel` + `niceTimeTicks` (pure, node-importable) |
| `src/components/local-models/trend-chart.tsx` | NEW — `TrendChart` SVG component (this doc §5) |
| `src/components/local-models/chart-palette.ts` | NEW — `PALETTE`, `colourFor`, `shortId`, `SOURCE_LABELS`, `fmtClockShort` extracted |
| `src/components/local-models/quality-speed-chart.tsx` | EDIT :49-97, :845-850 — import from chart-palette, delete local copies |
| `src/components/local-models/multi-bench-panel.tsx` | EDIT :73 add `chartTab` state; :78-92 tab toggle + conditional `QualitySpeedChart`/`TrendChart`; :333 `ModelSection` gets `id={\`run-${run.runId}\`}`; add `scrollToRun` handler |
| `src/components/local-models/history-store.ts` | EDIT :34, :199 — optional `origin?: 'imported'` pass-through (no version bump) |

No new dependencies. TS strict throughout; `exactOptionalPropertyTypes`-safe conditional spreads for optional props (matches existing `{...(onRetryCase !== undefined ? … : {})}` idiom).


## RISKS
- Series fragmentation: users who tweak params every run get one short series per fingerprint and no long trend line; mitigated by legend grouping + per-series hide, but if it proves noisy a follow-up 'merge variants' toggle (fold to modelKey, dashed vertical markers at fingerprint changes) is the escape hatch.
- caseTimeoutMs is excluded from the fingerprint but can shift pass-rate indirectly (timeouts produce skipped rows, changing the graded set); if users vary it, drift shows inside one series — revisit inclusion if reported.
- Legacy-migrated runs all have runConfig:{} so they collapse into the default-fingerprint series even if their true params differed pre-migration; accepted (data is gone), worth a code comment.
- Shell hydration is the data source: if a future change stops hydrating full history into `runs` (e.g. for memory), TrendChart silently shrinks to the current session — the component should get a comment pinning this contract, or be switched to its own getAllRuns() at that point.
- modelKey uses port; restarting an engine on a different port (LM Studio custom port, llama.cpp --port) splits an otherwise continuous series — consistent with existing selection semantics but may surprise users.
- Hollow (suite-drift) and diamond (imported) markers plus hidden-series dimming add visual vocabulary with no precedent in the app; needs a one-line marker legend under the chart or users won't decode it.
- niceTimeTicks uses local-time boundary alignment; DST transitions can produce a 23/25h 'day' step — cosmetic only, ticks may look slightly uneven twice a year.

## CRITIQUE (needs-changes)
- [major] Partial runs pollute the trend line and the spec cannot filter them. Stopped runs get a partial summary (local-models-shell.tsx:347 sets `summary: res.summary` even when `ac.signal.aborted`) and errored runs keep the last per-case summary from `onCase` (:335-344); both get `finishedAt` set. The design's buildTrendSeries filter (`finishedAt !== null && summary !== null && summary.total > 0`) therefore includes runs whose pass-rate is computed over a *prefix* of the suite (cases run in fixed order), which is systematically biased — a run stopped after the easy early cases shows an inflated pass-rate dip/spike on the line, not random n-drift that the hollow-marker/Wilson-band story covers. Worse, `TrendRunInput` omits `phase`, so the pure module as typed has no way to exclude them.
  FIX: Add `readonly phase: RunPhase` (import type from multi-bench-panel) to TrendRunInput and filter buildTrendSeries to `phase === 'done'`. Note this also correctly drops legacy-migrated and hydration-coerced 'stopped' snapshots, which are partial by construction (history-store.ts:266, local-models-shell.tsx:133-135). If stopped runs are wanted at all, render them as a distinct marker excluded from the polyline, not as ordinary points.
- [minor] The `origin?: 'imported'` pass-through as specified will not compile. `storedToRunState` (history-store.ts:199) has an annotated return type `ModelRunState & RunMeta`; adding `origin: s.origin` to the returned object literal triggers TS2353 excess-property error under strict mode because neither ModelRunState (multi-bench-panel.tsx:40-64) nor RunMeta (history-store.ts:221-227) declares `origin`. The file-by-file change list only names history-store.ts :34 and :199, omitting the required type extension.
  FIX: Also add `readonly origin?: 'imported'` to RunMeta (history-store.ts:221) — that is enough for the intersection return type to accept it, keeps ModelRunState untouched for existing consumers, and the field then flows through the shell's `{ ...r, phase: safePhase }` spread (local-models-shell.tsx:135) at runtime into TrendRunInput. Add history-store.ts:221 to the change list.
- [minor] `scrollToRun` is broken when the user is in the 'by-case' view: it calls `setView('by-model')` then synchronously `document.getElementById('run-...')`. React batches the state update, so the ModelSection elements (rendered only when `view === 'by-model'`, multi-bench-panel.tsx:94-102) do not exist yet and `scrollIntoView` silently no-ops. Click-to-jump was a decisive rationale for placing the chart in MultiBenchPanel, and it fails in one of the two view modes.
  FIX: Either wrap the setView in `flushSync` from react-dom before querying the DOM, or set a `pendingScrollRunId` state and perform the scrollIntoView in a `useEffect` that fires after the by-model sections have rendered (clear the pending id afterwards). requestAnimationFrame after setView also works but is less deterministic.
- [minor] `TrendChart(...): JSX.Element | null` will not typecheck: the project uses `@types/react` ^19 (package.json:42), which removed the global `JSX` namespace, and no file in src/ currently references `JSX.Element` (verified by grep) so nothing re-declares it. `tsc -b` in CI fails with 'Cannot find namespace JSX'. Relatedly, the design cites an '`exactOptionalPropertyTypes`-safe' idiom, but tsconfig.json does not enable that flag — harmless, just don't design around a constraint that doesn't exist.
  FIX: Drop the explicit return annotation (matching QualitySpeedChart and every other component in the codebase, which rely on inference), or use `import type { JSX } from 'react'` / `React.JSX.Element | null` if an annotation is wanted.
- [minor] `niceTimeTicks` step ladder tops out at 30d while targeting ~6 ticks; a history spanning 6-12 months (plausible for the persistent-IDB use case this feature exists for) yields 6-12+ crowded month ticks with 'Jun'-granularity labels, and >1 year gets worse — the axis degrades exactly on the long-horizon data the trends view is for.
  FIX: Extend the ladder with 90d and 365d steps (month labels 'Jun', year labels ''26'), or compute the step as span/6 snapped to the nearest ladder entry with the ladder open-ended (last entry multiplied as needed).
- [minor] Moving QualitySpeedChart under the `chartTab === 'compare'` branch unmounts it when the user switches to Trends, discarding its internal `excluded` RunFilter state (quality-speed-chart.tsx:113) — a user who curated the scatter filter loses it on every tab flip. Same applies in reverse to TrendChart's `hidden`/`metric` state.
  FIX: Keep both charts mounted and toggle visibility with a `hidden` attribute or `className={chartTab === 'compare' ? '' : 'hidden'}` wrapper divs, or lift the two small state sets into MultiBenchPanel. Cheap either way; note the always-mounted variant also keeps trend `useMemo` caches warm.