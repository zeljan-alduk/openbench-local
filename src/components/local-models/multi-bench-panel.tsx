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

import { useState } from 'react';
import type { BenchCaseRow, BenchSummary } from './bench-direct';
import { BenchTable } from './bench-table';
import type { DiscoveredLocalModel } from './discovery-direct';
import { QualitySpeedChart } from './quality-speed-chart';

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
}

interface Props {
  readonly runs: readonly ModelRunState[];
  readonly suiteCases: number;
  readonly onRetryCase?: (modelKey: string, caseId: string) => void;
}

export function MultiBenchPanel({ runs, suiteCases, onRetryCase }: Props) {
  const [view, setView] = useState<'by-model' | 'by-case'>('by-model');
  if (runs.length === 0) return null;
  const showCompare = runs.length >= 2;
  return (
    <div className="flex flex-col gap-6">
      {showCompare ? (
        <>
          <ComparisonStrip runs={runs} />
          <QualitySpeedChart runs={runs} />
          <div className="flex items-center justify-end gap-1 print:hidden">
            <span className="text-[11px] text-fg-muted">View:</span>
            <ToggleBtn active={view === 'by-model'} onClick={() => setView('by-model')}>
              By model
            </ToggleBtn>
            <ToggleBtn active={view === 'by-case'} onClick={() => setView('by-case')}>
              By case (side-by-side)
            </ToggleBtn>
          </div>
        </>
      ) : null}
      {showCompare && view === 'by-case' ? <ByCaseGrid runs={runs} /> : null}
      {(view === 'by-model' || !showCompare) &&
        runs.map((r, idx) => (
          <ModelSection
            key={`${r.model.source}-${r.model.id}-${r.model.port}-${idx}`}
            run={r}
            suiteCases={suiteCases}
            {...(onRetryCase !== undefined ? { onRetryCase } : {})}
          />
        ))}
    </div>
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
              {runs.map((r, i) => (
                <th
                  key={`hdr-${r.model.source}-${r.model.id}-${r.model.port}-${i}`}
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
                {runs.map((r, i) => {
                  const row = r.rows.find((x) => x.id === cid);
                  return (
                    <td
                      key={`cell-${r.model.source}-${r.model.id}-${r.model.port}-${i}-${cid}`}
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
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle/40 text-[10px] uppercase tracking-wide text-fg-muted">
            <th className="px-3 py-2 text-left font-medium">Model</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Pass</th>
            <th className="px-3 py-2 text-right font-medium">Avg tok/s</th>
            <th className="px-3 py-2 text-right font-medium">P95 latency</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <CompareRow key={`${r.model.source}-${r.model.id}-${r.model.port}-${i}`} run={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ run }: { run: ModelRunState }) {
  const s = run.summary;
  const passLabel = s === null ? '—' : `${s.passed}/${s.total}`;
  const passPct = s === null ? null : Math.round(s.passRate * 100);
  const passClass =
    passPct === null
      ? 'text-fg-muted'
      : passPct >= 90
        ? 'text-emerald-600 dark:text-emerald-400'
        : passPct >= 60
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400';
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="truncate font-mono text-[12px] text-fg" title={run.model.id}>
            {run.model.id}
          </span>
          <span className="font-mono text-[10px] text-fg-muted">{run.model.source}</span>
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
      <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-fg">
        {s === null || s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right align-top font-mono tabular-nums text-fg">
        {s === null ? '—' : `${(s.p95LatencyMs / 1000).toFixed(1)} s`}
      </td>
    </tr>
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
