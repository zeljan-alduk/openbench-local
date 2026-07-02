'use client';

/**
 * Comparative view across multiple selected models.
 *
 * Renders, in order:
 *   1. A compact comparison strip — one row per model with pass-rate,
 *      avg tok/s, p95 latency. Visible once the second model is queued
 *      (no point comparing against a single column).
 *   2. One stacked results section per model — its own `BenchTable`,
 *      its own header with a phase badge ("running"/"done"/"queued"/
 *      "stopped"/"error"). The currently-running model auto-scrolls
 *      into view via a heading anchor.
 *
 * Sequential by design: only one model runs at a time. The shell
 * advances `phase` from `queued` → `running` → `done` per model as it
 * iterates the selection list.
 */

import { useMemo, useState } from 'react';
import type { BenchCaseRow, BenchSummary, RunConfig } from './bench-direct';
import { BenchTable } from './bench-table';
import type { DiscoveredLocalModel } from './discovery-direct';
import { QualitySpeedChart } from './quality-speed-chart';
import { admitQuantGroups, effectiveQuant } from './model-id-parse';
import { newcombeDiffInterval, wilsonInterval } from './stats';
import { passTextClass } from './status-colors';
import { TrendChart } from './trend-chart';

export type RunPhase = 'queued' | 'running' | 'done' | 'stopped' | 'error';

/**
 * Streaming-row state for the case in flight. Lives at the model
 * level so the bench table can render the partial output while the
 * case is still running.
 */
export interface InFlightCase {
  readonly caseId: string;
  readonly content: string;
  readonly reasoning: string;
  readonly startedAt: number;
}

export interface ModelRunState {
  readonly model: DiscoveredLocalModel;
  readonly phase: RunPhase;
  readonly rows: readonly BenchCaseRow[];
  readonly summary: BenchSummary | null;
  readonly error: string | null;
  /** When non-null, a case is actively streaming for this model. */
  readonly inFlight: InFlightCase | null;
  /** Warm-up ping result, recorded when the runner starts the model. */
  readonly warmUp: { ok: boolean; ms: number; error?: string } | null;
  /**
   * Stable identity for this single model-run within a session. New
   * runs append to the in-memory `runs` array rather than replacing
   * it, so each entry needs its own id for delete and chart-filter.
   */
  readonly runId: string;
  /** Groups all model runs that started together (one Start click). */
  readonly sessionId: string;
  /** epoch ms — when this model's run dispatched (post-warm-up). */
  readonly startedAt: number;
  /** epoch ms — null while running, set on done/stopped/error. */
  readonly finishedAt: number | null;
  /** Effective generation parameters that produced this run. */
  readonly runConfig: RunConfig;
}

interface Props {
  readonly runs: readonly ModelRunState[];
  readonly suiteCases: number;
  readonly onRetryCase?: (modelKey: string, caseId: string) => void;
}

export function MultiBenchPanel({ runs, suiteCases, onRetryCase }: Props) {
  const [view, setView] = useState<'by-model' | 'by-case' | 'quant-ab'>('by-model');
  const [chartTab, setChartTab] = useState<'compare' | 'trends'>('compare');
  // Quant A/B is only offered when the CURRENT runs actually contain
  // ≥2 distinct known quants of one base model — same admission rule
  // as the chart connectors, so the views can't disagree.
  const quantGroups = useMemo(() => admitQuantGroups(runs), [runs]);
  if (runs.length === 0) return null;
  const showCompare = runs.length >= 2;
  const showQuant = quantGroups.size > 0;
  const effectiveView = view === 'quant-ab' && !showQuant ? 'by-model' : view;
  return (
    <div className="flex flex-col gap-6">
      {showCompare ? (
        <>
          <ComparisonStrip runs={runs} />
          <div className="flex items-center gap-1 print:hidden">
            <span className="text-[11px] text-fg-muted">Chart:</span>
            <ToggleBtn active={chartTab === 'compare'} onClick={() => setChartTab('compare')}>
              Quality × speed
            </ToggleBtn>
            <ToggleBtn active={chartTab === 'trends'} onClick={() => setChartTab('trends')}>
              Trends over time
            </ToggleBtn>
          </div>
          {/* Both charts stay MOUNTED so the scatter's run-filter and
              the trend's legend selections survive tab switches; the
              inactive one is display-hidden. */}
          <div className={chartTab === 'compare' ? '' : 'hidden'}>
            <QualitySpeedChart runs={runs} />
          </div>
          <div className={chartTab === 'trends' ? '' : 'hidden'}>
            <TrendChart runs={runs} />
          </div>
          <div className="flex items-center justify-end gap-1 print:hidden">
            <span className="text-[11px] text-fg-muted">View:</span>
            <ToggleBtn active={effectiveView === 'by-model'} onClick={() => setView('by-model')}>
              By model
            </ToggleBtn>
            <ToggleBtn active={effectiveView === 'by-case'} onClick={() => setView('by-case')}>
              By case (side-by-side)
            </ToggleBtn>
            {showQuant ? (
              <ToggleBtn active={effectiveView === 'quant-ab'} onClick={() => setView('quant-ab')}>
                Quant A/B
              </ToggleBtn>
            ) : null}
          </div>
        </>
      ) : null}
      {showCompare && effectiveView === 'by-case' ? <ByCaseGrid runs={runs} /> : null}
      {showCompare && effectiveView === 'quant-ab' ? (
        <QuantAbPanel groups={quantGroups} />
      ) : null}
      {(effectiveView === 'by-model' || !showCompare) &&
        runs.map((r) => (
          <ModelSection
            key={r.runId}
            run={r}
            suiteCases={suiteCases}
            {...(onRetryCase !== undefined ? { onRetryCase } : {})}
          />
        ))}
    </div>
  );
}

/**
 * Quantization A/B: for each admitted group (one base model, ≥2
 * distinct known quants) show every run against the highest-precision
 * variant — pass-rate delta with a Newcombe 95% CI and a verdict chip.
 */
function QuantAbPanel({
  groups,
}: {
  groups: ReadonlyMap<string, readonly ModelRunState[]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from(groups.entries()).map(([groupKey, members]) => (
        <QuantAbGroup key={groupKey} groupKey={groupKey} members={members} />
      ))}
    </div>
  );
}

/** Rough precision rank so "vs" defaults to the highest-precision variant. */
function quantRank(quant: string | null): number {
  if (quant === null) return -1;
  if (/^(f|fp|bf)32/.test(quant)) return 32;
  if (/^(f|fp|bf)16/.test(quant)) return 16;
  const m = /^i?q(\d)/.exec(quant) ?? /^(\d)bit$/.exec(quant) ?? /^int(\d)$/.exec(quant);
  if (m !== null) return Number(m[1]);
  if (quant === 'mxfp4' || quant === 'nf4') return 4;
  if (quant === 'awq' || quant === 'gptq') return 4;
  if (quant === 'qat') return 4;
  return 0;
}

function QuantAbGroup({
  groupKey,
  members,
}: {
  groupKey: string;
  members: readonly ModelRunState[];
}) {
  const done = members.filter((m) => m.summary !== null && m.summary.total > 0);
  const baseline = done.reduce<ModelRunState | null>((best, m) => {
    if (best === null) return m;
    return quantRank(effectiveQuant(m.model)) > quantRank(effectiveQuant(best.model)) ? m : best;
  }, null);
  if (baseline === null || done.length < 2) return null;
  const b = baseline.summary as NonNullable<ModelRunState['summary']>;
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-bg">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-2.5">
        <span className="font-mono text-[12px] font-semibold text-fg">{groupKey.replace('::', ' · ')}</span>
        <span className="text-[11px] text-fg-muted">
          vs highest precision ({effectiveQuant(baseline.model) ?? '?'}) — does quality hold as the
          quant shrinks?
        </span>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle/40 text-[10px] uppercase tracking-wide text-fg-muted">
            <th className="px-3 py-2 text-left font-medium">Quant</th>
            <th className="px-3 py-2 text-right font-medium">Pass</th>
            <th className="px-3 py-2 text-right font-medium">Δ vs baseline (95% CI)</th>
            <th className="px-3 py-2 text-right font-medium">Avg tok/s</th>
            <th className="px-3 py-2 text-right font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {done
            .slice()
            .sort((x, y) => quantRank(effectiveQuant(y.model)) - quantRank(effectiveQuant(x.model)))
            .map((m) => {
              const s = m.summary as NonNullable<ModelRunState['summary']>;
              const isBaseline = m.runId === baseline.runId;
              const diff = newcombeDiffInterval(s.passed, s.total, b.passed, b.total);
              const degrades = diff.hi < 0;
              const speedup =
                s.avgTokPerSec !== null && b.avgTokPerSec !== null && b.avgTokPerSec > 0
                  ? s.avgTokPerSec / b.avgTokPerSec
                  : null;
              return (
                <tr key={m.runId} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono text-[12px] text-fg">
                      {effectiveQuant(m.model) ?? '?'}
                    </span>
                    <span className="ml-2 truncate font-mono text-[10px] text-fg-muted" title={m.model.id}>
                      {m.model.id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right align-top font-mono tabular-nums">
                    <span className={passTextClass(Math.round(s.passRate * 100))}>
                      {s.passed}/{s.total}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right align-top font-mono text-[11px] tabular-nums text-fg-muted">
                    {isBaseline
                      ? 'baseline'
                      : `${diff.lo >= 0 ? '+' : ''}${Math.round(((s.passRate - b.passRate) * 100))} pts (${Math.round(diff.lo * 100)}…${Math.round(diff.hi * 100)})`}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-fg">
                    {s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)}
                    {speedup !== null && !isBaseline ? (
                      <span className="ml-1 text-[10px] text-fg-muted">({speedup.toFixed(1)}×)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {isBaseline ? (
                      <span className="text-[11px] text-fg-faint">—</span>
                    ) : degrades ? (
                      <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-600 dark:text-red-400">
                        degrades (95%)
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        quality holds
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </section>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'bg-accent/15 text-accent'
          : 'border border-border bg-bg text-fg-muted hover:bg-bg-subtle',
      ].join(' ')}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/**
 * Side-by-side per-case grid: rows are case ids (from the union of
 * cases observed in any model's run), columns are models. Each cell
 * shows the pass/fail/skip glyph + a tail snippet of the model's
 * actual output for that case. Useful for "why did A pass and B
 * fail?" inspection without expanding both model sections.
 */
function ByCaseGrid({ runs }: { runs: readonly ModelRunState[] }) {
  // Union of case ids in their first-observed order.
  const caseIds: string[] = [];
  const seen = new Set<string>();
  for (const r of runs) {
    for (const row of r.rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        caseIds.push(row.id);
      }
    }
  }
  return (
    <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <header className="border-b border-border px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Per-case comparison
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Each row is one case · each column is one selected model · cell shows the model's actual
          output snippet.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle/40 text-[10px] uppercase tracking-wide text-fg-muted">
              <th className="sticky left-0 z-10 bg-bg-subtle/60 px-3 py-2 text-left font-medium">
                Case
              </th>
              {runs.map((r) => (
                <th
                  key={`hdr-${r.runId}`}
                  className="px-3 py-2 text-left font-medium"
                >
                  <span
                    className="block max-w-[14rem] truncate font-mono text-[11px] normal-case text-fg"
                    title={r.model.id}
                  >
                    {r.model.id}
                  </span>
                  <span className="font-mono text-[10px] normal-case text-fg-muted">
                    {r.model.source}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caseIds.map((cid) => (
              <tr key={cid} className="border-b border-border/60 last:border-0">
                <td className="sticky left-0 z-10 bg-bg-elevated px-3 py-2 align-top font-mono text-[12px] text-fg">
                  {cid}
                </td>
                {runs.map((r) => {
                  const row = r.rows.find((x) => x.id === cid);
                  return (
                    <td
                      key={`cell-${r.runId}-${cid}`}
                      className="px-3 py-2 align-top"
                    >
                      <CompareCell row={row} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompareCell({ row }: { row: BenchCaseRow | undefined }) {
  if (row === undefined) {
    return <span className="font-mono text-[11px] text-fg-faint">—</span>;
  }
  const status = row.skipped
    ? { glyph: '–', tone: 'text-fg-muted' }
    : row.passed
      ? { glyph: '✓', tone: 'text-emerald-600 dark:text-emerald-400' }
      : row.error !== undefined
        ? { glyph: '!', tone: 'text-amber-600 dark:text-amber-400' }
        : { glyph: '✗', tone: 'text-red-600 dark:text-red-400' };
  const out =
    row.output.length > 0
      ? row.output
      : row.toolCalls.length > 0
        ? row.toolCalls.map((t) => `${t.name}(${t.argumentsRaw})`).join(' · ')
        : '';
  const snippet = out.length > 120 ? `${out.slice(0, 120)}…` : out;
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-baseline gap-1.5 font-mono text-[11px] ${status.tone}`}>
        <span className="text-base leading-none">{status.glyph}</span>
        <span className="tabular-nums text-fg-muted">
          {row.tokPerSec !== null ? `${row.tokPerSec.toFixed(0)} tok/s` : '—'}
          {row.totalMs > 0 ? ` · ${(row.totalMs / 1000).toFixed(1)}s` : ''}
        </span>
      </div>
      {snippet.length > 0 ? (
        <pre className="line-clamp-3 max-w-[18rem] whitespace-pre-wrap break-words font-mono text-[11px] text-fg-muted">
          {snippet}
        </pre>
      ) : row.skipped ? (
        <span className="text-[11px] text-fg-faint">{row.skipReason ?? 'skipped'}</span>
      ) : row.error !== undefined ? (
        <span className="line-clamp-2 max-w-[18rem] text-[11px] text-amber-600 dark:text-amber-400">
          {row.error}
        </span>
      ) : null}
    </div>
  );
}

function ComparisonStrip({ runs }: { runs: readonly ModelRunState[] }) {
  // Baseline for the significance column: the finished run with the
  // highest pass rate. Every other row is tested against it pairwise.
  const baseline = useMemo(() => {
    const done = runs.filter((r) => r.summary !== null && r.summary.total > 0);
    if (done.length < 2) return null;
    return done.reduce((best, r) =>
      (r.summary?.passRate ?? 0) > (best.summary?.passRate ?? 0) ? r : best,
    );
  }, [runs]);
  const caveat =
    runs.length > 2
      ? `${runs.length - 1} pairwise tests vs the leader, no multiple-comparison correction — expect ~5% false positives per test.`
      : undefined;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle/40 text-[10px] uppercase tracking-wide text-fg-muted">
            <th className="px-3 py-2 text-left font-medium">Model</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Pass</th>
            <th className="px-3 py-2 text-right font-medium">95% CI</th>
            {baseline !== null ? (
              <th className="px-3 py-2 text-right font-medium" title={caveat}>
                vs leader
              </th>
            ) : null}
            <th className="px-3 py-2 text-right font-medium">Avg tok/s</th>
            <th className="px-3 py-2 text-right font-medium">P95 latency</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <CompareRow key={r.runId} run={r} baseline={baseline} caveat={caveat} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({
  run,
  baseline,
  caveat,
}: {
  run: ModelRunState;
  baseline: ModelRunState | null;
  caveat?: string;
}) {
  const s = run.summary;
  const passLabel = s === null ? '—' : `${s.passed}/${s.total}`;
  const passPct = s === null ? null : Math.round(s.passRate * 100);
  const passClass = passTextClass(passPct);
  const ci = s !== null && s.total >= 5 ? wilsonInterval(s.passed, s.total) : null;
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="truncate font-mono text-[12px] text-fg" title={run.model.id}>
            {run.model.id}
          </span>
          <span className="font-mono text-[10px] text-fg-muted">{run.model.source}</span>
          <RunIdentityLabel startedAt={run.startedAt} config={run.runConfig} />
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <PhaseChip phase={run.phase} />
      </td>
      <td className="px-3 py-2 text-right align-top">
        <span className={`font-mono tabular-nums ${passClass}`}>
          {passLabel}
          {passPct !== null ? (
            <span className="ml-1 text-[10px] font-normal text-fg-muted">{passPct}%</span>
          ) : null}
        </span>
      </td>
      <td
        className="px-3 py-2 text-right align-top font-mono text-[11px] tabular-nums text-fg-muted"
        title={
          ci !== null
            ? 'Wilson 95% confidence interval on the pass rate — overlapping intervals mean the difference may be noise.'
            : undefined
        }
      >
        {ci !== null ? `${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%` : '—'}
      </td>
      {baseline !== null ? (
        <td className="px-3 py-2 text-right align-top">
          <SignificanceBadge run={run} baseline={baseline} caveat={caveat} />
        </td>
      ) : null}
      <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-fg">
        {s === null || s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-fg">
        {s === null ? '—' : `${(s.p95LatencyMs / 1000).toFixed(1)} s`}
      </td>
    </tr>
  );
}

/**
 * Pairwise Newcombe test of this run vs the current leader. "different"
 * only when the 95% interval on the pass-rate difference excludes 0 —
 * the honest default is "within noise".
 */
function SignificanceBadge({
  run,
  baseline,
  caveat,
}: {
  run: ModelRunState;
  baseline: ModelRunState;
  caveat?: string;
}) {
  const s = run.summary;
  const b = baseline.summary;
  if (s === null || b === null || s.total < 5 || b.total < 5) {
    return <span className="text-[11px] text-fg-faint">—</span>;
  }
  if (run.runId === baseline.runId) {
    return <span className="text-[11px] text-fg-faint">leader</span>;
  }
  const diff = newcombeDiffInterval(b.passed, b.total, s.passed, s.total);
  const significant = diff.lo > 0 || diff.hi < 0;
  const tempZeroNote =
    run.runConfig.temperature === 0
      ? ' Note: at temperature 0, repeats can be identical — intervals may be optimistic.'
      : '';
  const title = `Leader is ${b.passed}/${b.total}, this run ${s.passed}/${s.total}; 95% CI on the difference: ${Math.round(diff.lo * 100)}–${Math.round(diff.hi * 100)} pts.${caveat !== undefined ? ` ${caveat}` : ''}${tempZeroNote}`;
  return significant ? (
    <span
      className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-600 dark:text-red-400"
      title={title}
    >
      behind (95%)
    </span>
  ) : (
    <span
      className="inline-flex items-center rounded-full bg-bg-subtle px-2 py-0.5 font-mono text-[10px] text-fg-muted"
      title={title}
    >
      within noise
    </span>
  );
}

function ModelSection({
  run,
  suiteCases,
  onRetryCase,
}: {
  run: ModelRunState;
  suiteCases: number;
  onRetryCase?: (modelKey: string, caseId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-fg" title={run.model.id}>
            {run.model.id}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">
            {run.model.source} · {run.model.displayBaseUrl}
          </p>
          <RunIdentityLabel startedAt={run.startedAt} config={run.runConfig} />
          {run.warmUp !== null ? (
            <p
              className={`mt-1 font-mono text-[10px] ${
                run.warmUp.ok ? 'text-fg-faint' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {run.warmUp.ok
                ? `warm-up ok · ${run.warmUp.ms} ms`
                : `warm-up failed (${run.warmUp.ms} ms): ${run.warmUp.error ?? '?'}`}
            </p>
          ) : null}
        </div>
        <PhaseChip phase={run.phase} />
      </header>
      <div className="px-5 py-5">
        <BenchTable
          rows={run.rows}
          summary={run.summary}
          runError={run.error}
          inFlight={run.inFlight}
          // Show pending placeholders only while running — once stopped or
          // done, the row count is final and placeholders would mislead.
          suiteCases={run.phase === 'running' ? suiteCases : run.rows.length}
          {...(onRetryCase !== undefined
            ? {
                onRetryCase: (caseId: string) =>
                  onRetryCase(`${run.model.source}::${run.model.id}::${run.model.port}`, caseId),
              }
            : {})}
        />
      </div>
    </section>
  );
}

/**
 * Compact "when + how" label shown next to the model identity in
 * the comparison strip and per-model section header. Useful when the
 * same model appears in `runs` more than once (re-run with different
 * params) — gives the eye an anchor without expanding the row.
 */
function RunIdentityLabel({
  startedAt,
  config,
}: {
  startedAt: number;
  config: RunConfig;
}) {
  const time = useMemo(() => fmtClockShort(startedAt), [startedAt]);
  const params = useMemo(() => formatKeyParams(config), [config]);
  if (params.length === 0) {
    return (
      <span className="font-mono text-[10px] text-fg-faint" title={new Date(startedAt).toLocaleString()}>
        {time}
      </span>
    );
  }
  return (
    <span
      className="font-mono text-[10px] text-fg-faint"
      title={new Date(startedAt).toLocaleString()}
    >
      {time} · {params}
    </span>
  );
}

function fmtClockShort(epoch: number): string {
  const d = new Date(epoch);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatKeyParams(c: RunConfig): string {
  const bits: string[] = [];
  if (c.temperature !== undefined) bits.push(`temp=${c.temperature}`);
  if (c.reasoningEffort !== undefined) bits.push(`reason=${c.reasoningEffort}`);
  if (c.topP !== undefined) bits.push(`top_p=${c.topP}`);
  if (c.repeatCount !== undefined && c.repeatCount > 1) bits.push(`×${c.repeatCount}`);
  return bits.join(' · ');
}

function PhaseChip({ phase }: { phase: RunPhase }) {
  const map: Record<RunPhase, { label: string; tone: string }> = {
    queued: { label: 'Queued', tone: 'bg-bg-subtle text-fg-muted' },
    running: { label: 'Running', tone: 'bg-accent/15 text-accent' },
    done: { label: 'Done', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    stopped: { label: 'Stopped', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
    error: { label: 'Error', tone: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  };
  const { label, tone } = map[phase];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}
