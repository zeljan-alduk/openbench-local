'use client';

/**
 * Trends over time — pass rate per benchmark series across the
 * persisted history. A series is one model+endpoint+params
 * combination (`runGroupKey`); changing the temperature starts a new
 * series rather than polluting the old line. Only `phase === 'done'`
 * runs plot (stopped/error runs carry partial summaries that would
 * bend the line), and each point carries a Wilson 95% CI band —
 * "did this model regress after the engine update?" needs the band,
 * not just the point.
 *
 * Hand-rolled SVG like the Quality × Speed scatter — no chart lib.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { ModelRunState } from './multi-bench-panel';
import { runGroupKey, wilsonInterval } from './stats';

const W = 880;
const H = 360;
const PAD_L = 52;
const PAD_R = 20;
const PAD_T = 16;
const PAD_B = 42;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const PALETTE: readonly string[] = [
  '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#d946ef', '#84cc16', '#14b8a6',
  '#6366f1', '#f97316', '#06b6d4', '#ec4899', '#a855f7', '#22c55e', '#eab308', '#3b82f6',
];

function colourFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length] as string;
}

interface TrendPoint {
  readonly runId: string;
  readonly at: number;
  readonly passRate: number;
  readonly ciLo: number;
  readonly ciHi: number;
  readonly passed: number;
  readonly total: number;
  readonly tokps: number | null;
  readonly origin?: string;
}

interface Series {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly TrendPoint[];
}

/** Time-tick ladder — extends well past 30d (persistent-IDB histories span months). */
const TICK_STEPS_MS: readonly number[] = [
  60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000,
  7 * 24 * 60 * 60_000, 30 * 24 * 60 * 60_000, 90 * 24 * 60 * 60_000, 365 * 24 * 60 * 60_000,
];

function timeTicks(min: number, max: number, target = 6): number[] {
  const span = Math.max(1, max - min);
  const step =
    TICK_STEPS_MS.find((s) => span / s <= target) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= max; t += step) ticks.push(t);
  return ticks;
}

function fmtTick(epoch: number, spanMs: number): string {
  const d = new Date(epoch);
  if (spanMs <= 24 * 60 * 60_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 90 * 24 * 60 * 60_000) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { year: '2-digit', month: 'short' });
}

export function TrendChart({ runs }: { runs: readonly ModelRunState[] }): ReactElement | null {
  const [hover, setHover] = useState<{ series: Series; point: TrendPoint } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const allSeries = useMemo<readonly Series[]>(() => {
    const byKey = new Map<string, { label: string; points: TrendPoint[] }>();
    for (const r of runs) {
      if (r.phase !== 'done' || r.summary === null || r.summary.total === 0) continue;
      if (r.finishedAt === null) continue;
      const key = runGroupKey(r.model, r.runConfig);
      const ci = wilsonInterval(r.summary.passed, r.summary.total);
      const slot = byKey.get(key) ?? { label: r.model.id, points: [] };
      slot.points.push({
        runId: r.runId,
        at: r.finishedAt,
        passRate: r.summary.passRate,
        ciLo: ci.lo,
        ciHi: ci.hi,
        passed: r.summary.passed,
        total: r.summary.total,
        tokps: r.summary.avgTokPerSec,
        ...((r as { origin?: string }).origin !== undefined
          ? { origin: (r as { origin?: string }).origin }
          : {}),
      });
      byKey.set(key, slot);
    }
    return Array.from(byKey.entries())
      .map(([key, s]) => ({
        key,
        label: s.label,
        color: colourFor(key),
        points: [...s.points].sort((a, b) => a.at - b.at),
      }))
      .sort((a, b) => b.points.length - a.points.length);
  }, [runs]);

  const series = useMemo(
    () => allSeries.filter((s) => !hidden.has(s.key)),
    [allSeries, hidden],
  );

  const [minAt, maxAt] = useMemo(() => {
    const ats = series.flatMap((s) => s.points.map((p) => p.at));
    if (ats.length === 0) return [0, 1] as const;
    const min = Math.min(...ats);
    const max = Math.max(...ats);
    return max === min ? ([min - 60_000, max + 60_000] as const) : ([min, max] as const);
  }, [series]);

  if (allSeries.length === 0 || allSeries.every((s) => s.points.length < 2)) {
    // Nothing to trend until at least one series has two finished runs.
    return null;
  }

  const xScale = (at: number) => PAD_L + ((at - minAt) / (maxAt - minAt)) * PLOT_W;
  const yScale = (rate: number) => PAD_T + (1 - rate) * PLOT_H;
  const spanMs = maxAt - minAt;
  const ticks = timeTicks(minAt, maxAt);

  return (
    <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Trends
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg">Pass rate over time</h2>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            One line per model + params combination; only completed runs plot. Shaded band =
            Wilson 95% CI — a "regression" inside the band is noise.
          </p>
        </div>
        <div className="flex max-w-md flex-wrap items-center justify-end gap-1.5">
          {allSeries.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  off
                    ? 'border-border text-fg-faint line-through'
                    : 'border-transparent bg-bg-subtle text-fg'
                }`}
                title={`${s.label} · ${s.points.length} runs${off ? ' (hidden)' : ''}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color, opacity: off ? 0.3 : 1 }}
                />
                {s.label.length > 24 ? `${s.label.slice(0, 24)}…` : s.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="relative px-3 py-4">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pass rate over time per model" className="w-full">
          {/* Gridlines + axes */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <g key={r}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yScale(r)}
                y2={yScale(r)}
                stroke="rgb(var(--border))"
                strokeWidth={r === 0 ? 1.2 : 0.6}
              />
              <text
                x={PAD_L - 8}
                y={yScale(r) + 3}
                textAnchor="end"
                className="fill-fg-muted font-mono text-[10px]"
              >
                {Math.round(r * 100)}%
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={xScale(t)}
                x2={xScale(t)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="rgb(var(--border))"
                strokeWidth={0.5}
                opacity={0.6}
              />
              <text
                x={xScale(t)}
                y={H - PAD_B + 16}
                textAnchor="middle"
                className="fill-fg-muted font-mono text-[10px]"
              >
                {fmtTick(t, spanMs)}
              </text>
            </g>
          ))}

          {series.map((s) => {
            const dimmed = hover !== null && hover.series.key !== s.key;
            return (
              <g key={s.key} opacity={dimmed ? 0.25 : 1} style={{ transition: 'opacity 120ms' }}>
                {/* CI band */}
                {s.points.length >= 2 ? (
                  <polygon
                    points={[
                      ...s.points.map((p) => `${xScale(p.at)},${yScale(p.ciHi)}`),
                      ...[...s.points].reverse().map((p) => `${xScale(p.at)},${yScale(p.ciLo)}`),
                    ].join(' ')}
                    fill={s.color}
                    opacity={0.1}
                    className="pointer-events-none"
                  />
                ) : null}
                {s.points.length >= 2 ? (
                  <polyline
                    points={s.points.map((p) => `${xScale(p.at)},${yScale(p.passRate)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.8}
                    className="pointer-events-none"
                  />
                ) : null}
                {s.points.map((p) => (
                  <circle
                    key={p.runId}
                    cx={xScale(p.at)}
                    cy={yScale(p.passRate)}
                    r={hover?.point.runId === p.runId ? 6 : 4}
                    fill={s.color}
                    stroke="rgb(var(--bg-elevated))"
                    strokeWidth={1.5}
                    tabIndex={0}
                    className="cursor-crosshair outline-none"
                    onMouseEnter={() => setHover({ series: s, point: p })}
                    onMouseLeave={() => setHover((cur) => (cur?.point.runId === p.runId ? null : cur))}
                    onFocus={() => setHover({ series: s, point: p })}
                    onBlur={() => setHover((cur) => (cur?.point.runId === p.runId ? null : cur))}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {hover !== null ? (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-border bg-bg-elevated p-3 text-left shadow-lg"
            style={{
              left: `${Math.min(92, Math.max(8, (xScale(hover.point.at) / W) * 100))}%`,
              top: `${(yScale(hover.point.passRate) / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <p className="truncate font-mono text-[11px] font-semibold text-fg">
              {hover.series.label}
            </p>
            <p className="font-mono text-[10px] text-fg-muted">
              {new Date(hover.point.at).toLocaleString()}
              {hover.point.origin !== undefined && hover.point.origin !== 'local'
                ? ` · ${hover.point.origin}`
                : ''}
            </p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <dt className="text-fg-muted">Pass</dt>
              <dd className="text-right font-mono text-fg">
                {hover.point.passed}/{hover.point.total}
              </dd>
              <dt className="text-fg-muted">95% CI</dt>
              <dd className="text-right font-mono text-fg">
                {Math.round(hover.point.ciLo * 100)}–{Math.round(hover.point.ciHi * 100)}%
              </dd>
              <dt className="text-fg-muted">Avg tok/s</dt>
              <dd className="text-right font-mono text-fg">
                {hover.point.tokps === null ? '—' : hover.point.tokps.toFixed(1)}
              </dd>
            </dl>
            <p className="mt-1 text-[10px] text-fg-faint">
              n={hover.point.total} graded cases — suite composition can differ between runs.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
