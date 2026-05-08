'use client';

import { useMemo, useState } from 'react';
import type { ModelRunState } from './multi-bench-panel';

/**
 * Quality × Speed scatter chart.
 *
 * One point per benched model: Y is pass-rate (0–100%), X is mean
 * generation throughput (tok/s). Points are coloured by engine
 * source, and the Pareto frontier — the set of models that aren't
 * strictly dominated on both axes — is highlighted with a dashed
 * polyline.
 *
 * Pure inline SVG, no chart library; ~600 LOC of recharts saved by
 * doing the layout math ourselves. Tooltip + hover-grow are React
 * state; the chart itself is a viewBox-scaled responsive SVG with no
 * absolute pixel dependencies.
 *
 * Renders nothing when fewer than two models have usable summaries —
 * a single-point scatter is just noise.
 */

interface Props {
  readonly runs: readonly ModelRunState[];
}

interface Point {
  readonly id: string;
  readonly source: string;
  readonly displayBaseUrl: string;
  readonly passed: number;
  readonly total: number;
  readonly passRate: number;
  readonly avgTokPerSec: number;
  readonly p95LatencyMs: number;
  readonly totalMs: number;
  readonly color: string;
}

// Per-source colour. Keep emerald / violet / amber / rose so the
// dots read as distinct categories without clashing with the
// accent-blue brand and stay legible in dark mode.
const SOURCE_COLORS: Record<string, string> = {
  ollama: '#10b981',
  lmstudio: '#8b5cf6',
  vllm: '#f59e0b',
  llamacpp: '#f43f5e',
};
const SOURCE_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  vllm: 'vLLM',
  llamacpp: 'llama.cpp',
};

const W = 880;
const H = 440;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 28;
const PAD_B = 56;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

export function QualitySpeedChart({ runs }: Props) {
  const points = useMemo<readonly Point[]>(() => {
    return runs
      .filter(
        (r): r is ModelRunState & { summary: NonNullable<ModelRunState['summary']> } =>
          r.summary !== null &&
          r.summary.avgTokPerSec !== null &&
          Number.isFinite(r.summary.avgTokPerSec) &&
          r.summary.total > 0,
      )
      .map((r): Point => {
        const totalMs = r.rows.reduce((sum, row) => sum + row.totalMs, 0);
        const tokps = r.summary.avgTokPerSec ?? 0;
        return {
          id: r.model.id,
          source: r.model.source,
          displayBaseUrl: r.model.displayBaseUrl,
          passed: r.summary.passed,
          total: r.summary.total,
          passRate: r.summary.passRate,
          avgTokPerSec: tokps,
          p95LatencyMs: r.summary.p95LatencyMs,
          totalMs,
          color: SOURCE_COLORS[r.model.source] ?? '#64748b',
        };
      });
  }, [runs]);

  const [hover, setHover] = useState<Point | null>(null);

  // Hooks above any conditional return so Hooks order stays stable.
  // Compute scale + frontier even when there's no chart to draw —
  // they're cheap and consistent.
  const maxTokps = Math.max(1, ...points.map((p) => p.avgTokPerSec)) * 1.12;
  const xScale = (v: number) => PAD_L + (v / maxTokps) * PLOT_W;
  const yScale = (rate: number) => PAD_T + (1 - rate) * PLOT_H;

  const frontier = useMemo(() => {
    const front = points.filter(
      (p) =>
        !points.some(
          (q) =>
            q !== p &&
            q.passRate >= p.passRate &&
            q.avgTokPerSec >= p.avgTokPerSec &&
            (q.passRate > p.passRate || q.avgTokPerSec > p.avgTokPerSec),
        ),
    );
    return [...front].sort((a, b) => a.avgTokPerSec - b.avgTokPerSec);
  }, [points]);

  if (points.length < 2) return null;

  // Y axis ticks at 25% intervals, X axis ticks at 5 evenly-spaced
  // marks. Gridlines piggyback off the same values.
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * maxTokps);

  // Sources actually present, in render order, for the legend chip
  // strip.
  const sources = Array.from(new Set(points.map((p) => p.source)));

  return (
    <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Quality × speed
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg">
            Pareto frontier across {points.length} model{points.length === 1 ? '' : 's'}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-fg-muted">
            Each dot is one model. Up = higher pass-rate, right = faster mean throughput. The
            dashed line connects models on the Pareto frontier — they're not dominated on both
            axes by anyone else, so they're the rational choices for any quality / speed trade-off.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-mono text-fg-muted"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: SOURCE_COLORS[s] ?? '#64748b' }}
              />
              {SOURCE_LABELS[s] ?? s}
            </span>
          ))}
        </div>
      </header>

      <div className="relative px-3 py-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label="Scatter plot of pass-rate versus tokens-per-second per model"
        >
          {/* Plot frame */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="rgb(var(--bg))"
            stroke="rgb(var(--border))"
            strokeWidth={1}
          />

          {/* Y gridlines + tick labels */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={PAD_L}
                x2={PAD_L + PLOT_W}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="rgb(var(--border))"
                strokeWidth={1}
                strokeDasharray={t === 0 || t === 1 ? '0' : '2 4'}
                opacity={t === 0 || t === 1 ? 1 : 0.5}
              />
              <text
                x={PAD_L - 8}
                y={yScale(t) + 4}
                textAnchor="end"
                className="fill-fg-muted font-mono text-[11px]"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          {/* X gridlines + tick labels */}
          {xTicks.map((t, i) => (
            <g key={`x-${i}`}>
              <line
                x1={xScale(t)}
                x2={xScale(t)}
                y1={PAD_T}
                y2={PAD_T + PLOT_H}
                stroke="rgb(var(--border))"
                strokeWidth={1}
                strokeDasharray={i === 0 || i === xTicks.length - 1 ? '0' : '2 4'}
                opacity={i === 0 || i === xTicks.length - 1 ? 1 : 0.5}
              />
              <text
                x={xScale(t)}
                y={PAD_T + PLOT_H + 18}
                textAnchor="middle"
                className="fill-fg-muted font-mono text-[11px]"
              >
                {t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Axis titles */}
          <text
            x={PAD_L + PLOT_W / 2}
            y={H - 12}
            textAnchor="middle"
            className="fill-fg font-medium text-[12px]"
          >
            Avg tokens / second
          </text>
          <text
            x={-(PAD_T + PLOT_H / 2)}
            y={20}
            transform="rotate(-90)"
            textAnchor="middle"
            className="fill-fg font-medium text-[12px]"
          >
            Pass rate
          </text>

          {/* Pareto frontier polyline (under the dots so dots stay clickable). */}
          {frontier.length >= 2 ? (
            <polyline
              points={frontier
                .map((p) => `${xScale(p.avgTokPerSec)},${yScale(p.passRate)}`)
                .join(' ')}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              opacity={0.6}
              className="pointer-events-none"
            />
          ) : null}

          {/* Frontier markers — small ring under Pareto-optimal points. */}
          {frontier.map((p) => (
            <circle
              key={`ring-${p.id}-${p.source}`}
              cx={xScale(p.avgTokPerSec)}
              cy={yScale(p.passRate)}
              r={14}
              fill="none"
              stroke={p.color}
              strokeWidth={1.5}
              opacity={0.35}
              className="pointer-events-none"
            />
          ))}

          {/* Data points. Larger hit area than visual radius for
              easier hovering on dense plots. */}
          {points.map((p) => {
            const cx = xScale(p.avgTokPerSec);
            const cy = yScale(p.passRate);
            const isHover = hover === p;
            return (
              <g
                key={`pt-${p.id}-${p.source}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover((cur) => (cur === p ? null : cur))}
                onFocus={() => setHover(p)}
                onBlur={() => setHover((cur) => (cur === p ? null : cur))}
                tabIndex={0}
                className="outline-none [&:focus-visible_circle]:stroke-accent"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={18}
                  fill="transparent"
                  className="cursor-crosshair"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHover ? 11 : 8}
                  fill={p.color}
                  stroke="rgb(var(--bg-elevated))"
                  strokeWidth={2}
                  style={{ transition: 'r 120ms ease-out' }}
                  className="drop-shadow-sm"
                />
              </g>
            );
          })}
        </svg>

        {hover !== null ? <Tooltip point={hover} maxTokps={maxTokps} /> : null}
      </div>

      {/* Hidden table for screen readers — same data, navigable. */}
      <table className="sr-only">
        <caption>Quality vs speed per model</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Source</th>
            <th scope="col">Pass rate</th>
            <th scope="col">Avg tokens/s</th>
            <th scope="col">P95 latency</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={`a11y-${p.id}-${p.source}`}>
              <td>{p.id}</td>
              <td>{SOURCE_LABELS[p.source] ?? p.source}</td>
              <td>{(p.passRate * 100).toFixed(1)}%</td>
              <td>{p.avgTokPerSec.toFixed(1)}</td>
              <td>{(p.p95LatencyMs / 1000).toFixed(2)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Tooltip({ point, maxTokps }: { point: Point; maxTokps: number }) {
  // Position the tooltip relative to the SVG's viewBox by mapping
  // the data coords back into percentages. Tailwind's positioning
  // can then anchor a card on top of the chart without an extra
  // ResizeObserver round-trip.
  const xPct = ((PAD_L + (point.avgTokPerSec / maxTokps) * PLOT_W) / W) * 100;
  const yPct = ((PAD_T + (1 - point.passRate) * PLOT_H) / H) * 100;
  // Flip horizontally so the card never goes off the right edge.
  const flipX = xPct > 65;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-64 -translate-y-full rounded-lg border border-border bg-bg-elevated p-3 shadow-lg"
      style={{
        left: `${flipX ? xPct - 1 : xPct + 1}%`,
        top: `${yPct}%`,
        transform: `translate(${flipX ? '-100%' : '0'}, calc(-100% - 12px))`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate font-mono text-[12px] font-semibold text-fg"
            title={point.id}
          >
            {point.id}
          </p>
          <p className="truncate font-mono text-[10px] text-fg-muted">
            {SOURCE_LABELS[point.source] ?? point.source} · {point.displayBaseUrl}
          </p>
        </div>
        <span
          aria-hidden
          className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: point.color }}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-fg-muted">Pass rate</dt>
        <dd className="text-right font-mono font-semibold text-fg">
          {(point.passRate * 100).toFixed(1)}%
        </dd>
        <dt className="text-fg-muted">Passed</dt>
        <dd className="text-right font-mono text-fg">
          {point.passed} / {point.total}
        </dd>
        <dt className="text-fg-muted">Avg tok/s</dt>
        <dd className="text-right font-mono font-semibold text-fg">
          {point.avgTokPerSec.toFixed(1)}
        </dd>
        <dt className="text-fg-muted">P95 latency</dt>
        <dd className="text-right font-mono text-fg">
          {(point.p95LatencyMs / 1000).toFixed(2)} s
        </dd>
        <dt className="text-fg-muted">Total time</dt>
        <dd className="text-right font-mono text-fg">
          {(point.totalMs / 1000).toFixed(1)} s
        </dd>
      </dl>
    </div>
  );
}
