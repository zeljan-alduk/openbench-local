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
  readonly runId: string;
  readonly id: string;
  readonly source: string;
  readonly displayBaseUrl: string;
  readonly startedAt: number;
  readonly passed: number;
  readonly total: number;
  readonly passRate: number;
  readonly avgTokPerSec: number;
  readonly p95LatencyMs: number;
  readonly totalMs: number;
  readonly color: string;
}

// Per-model palette. Twelve hand-picked Tailwind 500-shade colours
// that read distinct in both light and dark mode and don't clash
// with the accent-blue brand. Models are assigned colours
// deterministically by id-hash so the same model lights up the same
// shade across reruns.
const PALETTE: readonly string[] = [
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#84cc16', // lime
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
];
const SOURCE_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  vllm: 'vLLM',
  llamacpp: 'llama.cpp',
};

/**
 * Pick a deterministic palette index for a model. Hash on the
 * `source::id::port` triple so the same endpoint always lights up
 * the same colour across reruns; permutations of the same set keep
 * stable colours.
 */
function colourFor(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

/** Truncate long model ids so labels don't run off the canvas. */
function shortId(id: string): string {
  return id.length > 28 ? `${id.slice(0, 27)}…` : id;
}

const W = 880;
const H = 440;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 28;
const PAD_B = 56;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

export function QualitySpeedChart({ runs }: Props) {
  // Runs the user has hidden via the filter dropdown. Defaults to
  // empty (everything included). Excluded entries are dropped before
  // the points are computed so the chart math, frontier, and label
  // placement all work on the visible subset only.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  const allCandidates = useMemo(
    () =>
      runs.filter(
        (r): r is ModelRunState & { summary: NonNullable<ModelRunState['summary']> } =>
          r.summary !== null &&
          r.summary.avgTokPerSec !== null &&
          Number.isFinite(r.summary.avgTokPerSec) &&
          r.summary.total > 0,
      ),
    [runs],
  );

  const points = useMemo<readonly Point[]>(() => {
    return allCandidates
      .filter((r) => !excluded.has(r.runId))
      .map((r): Point => {
        const totalMs = r.rows.reduce((sum, row) => sum + row.totalMs, 0);
        const tokps = r.summary.avgTokPerSec ?? 0;
        return {
          runId: r.runId,
          id: r.model.id,
          source: r.model.source,
          displayBaseUrl: r.model.displayBaseUrl,
          startedAt: r.startedAt,
          passed: r.summary.passed,
          total: r.summary.total,
          passRate: r.summary.passRate,
          avgTokPerSec: tokps,
          p95LatencyMs: r.summary.p95LatencyMs,
          totalMs,
          color: colourFor(`${r.model.source}::${r.model.id}::${r.model.port}`),
        };
      });
  }, [allCandidates, excluded]);

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

  // Bail when there's nothing useful to show even unfiltered. When
  // the user has merely filtered the set down below 2, render a
  // minimal frame so the filter UI stays reachable.
  if (allCandidates.length < 2) return null;
  const filteredOut = allCandidates.length - points.length;

  if (points.length < 2) {
    return (
      <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Quality × speed
            </p>
            <h2 className="mt-1 text-base font-semibold text-fg">
              {filteredOut} run{filteredOut === 1 ? '' : 's'} hidden
            </h2>
          </div>
          <RunFilter
            candidates={allCandidates}
            excluded={excluded}
            onExcludedChange={setExcluded}
          />
        </header>
        <div className="px-5 py-8 text-center text-sm text-fg-muted">
          Pick at least two runs in the filter to plot the Pareto frontier.
        </div>
      </section>
    );
  }

  // Y axis ticks at 25% intervals, X axis ticks at 5 evenly-spaced
  // marks. Gridlines piggyback off the same values.
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * maxTokps);

  // Bubble-size encoding for the third dimension: total wall-clock
  // time per model. Bigger dot = more total time (slower campaign);
  // smaller dot = faster. We pin the size range to [6, 16] so the
  // smallest is still hoverable and the biggest doesn't crowd
  // neighbours. When every model has the same totalMs (single-case
  // runs etc.) we fall back to a constant middle size.
  const minMs = Math.min(...points.map((p) => p.totalMs));
  const maxMs = Math.max(...points.map((p) => p.totalMs));
  const sizeFor = (ms: number): number => {
    if (maxMs === minMs) return 10;
    const t = (ms - minMs) / (maxMs - minMs);
    return 6 + t * 10;
  };
  const fastestPoint = points.reduce((a, b) => (a.totalMs <= b.totalMs ? a : b));
  const slowestPoint = points.reduce((a, b) => (a.totalMs >= b.totalMs ? a : b));

  // Greedy collision-aware label placement. Important models get first
  // pick of position; everyone else has to fit around them. Each label
  // tries 8 candidate offsets (cardinal + diagonal) and picks the
  // first that (a) stays inside the plot frame and (b) doesn't overlap
  // any already-placed label or dot. Falls back to the top-right
  // default when nothing fits.
  interface Placement {
    readonly point: Point;
    readonly cx: number;
    readonly cy: number;
    readonly baseR: number;
    readonly textX: number;
    readonly textY: number;
    readonly anchor: 'start' | 'end' | 'middle';
    readonly box: { x: number; y: number; w: number; h: number };
  }
  // Priority: Pareto-frontier dots first (they're the headline result),
  // then everyone else by pass-rate desc so high-quality models get
  // unobstructed labels even on crowded charts.
  const frontierIds = new Set(frontier.map((p) => p.runId));
  const orderedPoints = [...points].sort((a, b) => {
    const aFront = frontierIds.has(a.runId) ? 1 : 0;
    const bFront = frontierIds.has(b.runId) ? 1 : 0;
    if (aFront !== bFront) return bFront - aFront;
    return b.passRate - a.passRate;
  });
  const placements: Placement[] = [];
  // Approximate font metrics for the 11px mono text. Used purely for
  // overlap detection — visual rendering still uses the actual SVG.
  const FONT_CHAR_W = 6.6;
  const FONT_LINE_H = 14;
  // Plot bounds (with a small margin so labels can flirt with the
  // edge but not run off the canvas).
  const PLOT_BOUNDS = {
    x0: PAD_L - 2,
    y0: PAD_T - 2,
    x1: PAD_L + PLOT_W + 2,
    y1: PAD_T + PLOT_H + 2,
  };

  for (const p of orderedPoints) {
    const cx = xScale(p.avgTokPerSec);
    const cy = yScale(p.passRate);
    const baseR = sizeFor(p.totalMs);
    const labelText = shortId(p.id);
    const labelW = labelText.length * FONT_CHAR_W + 4;
    const off = baseR + 6;
    const offFar = baseR + 12;
    type Candidate = { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' };
    const candidates: readonly Candidate[] = [
      { dx: off, dy: -off, anchor: 'start' },
      { dx: -off, dy: -off, anchor: 'end' },
      { dx: off, dy: off + 12, anchor: 'start' },
      { dx: -off, dy: off + 12, anchor: 'end' },
      { dx: 0, dy: -offFar, anchor: 'middle' },
      { dx: 0, dy: offFar + 12, anchor: 'middle' },
      { dx: offFar + 4, dy: 4, anchor: 'start' },
      { dx: -offFar - 4, dy: 4, anchor: 'end' },
    ];

    const boxFor = (c: Candidate): { x: number; y: number; w: number; h: number } => {
      const tx = cx + c.dx;
      const ty = cy + c.dy;
      const x =
        c.anchor === 'end'
          ? tx - labelW
          : c.anchor === 'middle'
            ? tx - labelW / 2
            : tx;
      const y = ty - FONT_LINE_H + 2;
      return { x, y, w: labelW, h: FONT_LINE_H };
    };

    const inBounds = (b: { x: number; y: number; w: number; h: number }): boolean =>
      b.x >= PLOT_BOUNDS.x0 &&
      b.x + b.w <= PLOT_BOUNDS.x1 &&
      b.y >= PLOT_BOUNDS.y0 &&
      b.y + b.h <= PLOT_BOUNDS.y1;

    const collides = (b: { x: number; y: number; w: number; h: number }): boolean => {
      // Overlap with another label
      for (const pl of placements) {
        if (
          b.x < pl.box.x + pl.box.w &&
          b.x + b.w > pl.box.x &&
          b.y < pl.box.y + pl.box.h &&
          b.y + b.h > pl.box.y
        ) {
          return true;
        }
      }
      // Inside a peer dot's hit area (or its own)
      for (const pl of placements) {
        const cxDot = pl.cx;
        const cyDot = pl.cy;
        const r = pl.baseR + 4;
        const closestX = Math.max(b.x, Math.min(cxDot, b.x + b.w));
        const closestY = Math.max(b.y, Math.min(cyDot, b.y + b.h));
        const dx = closestX - cxDot;
        const dy = closestY - cyDot;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    };

    let chosen: Candidate | null = null;
    let chosenBox: { x: number; y: number; w: number; h: number } | null = null;
    for (const c of candidates) {
      const box = boxFor(c);
      if (!inBounds(box)) continue;
      if (collides(box)) continue;
      chosen = c;
      chosenBox = box;
      break;
    }
    // If every candidate failed, fall back to the default top-right
    // even if it overlaps. Better to show the label than swallow it.
    const fallback: Candidate = candidates[0]!;
    const finalCandidate = chosen ?? fallback;
    const finalBox = chosenBox ?? boxFor(fallback);

    placements.push({
      point: p,
      cx,
      cy,
      baseR,
      textX: cx + finalCandidate.dx,
      textY: cy + finalCandidate.dy,
      anchor: finalCandidate.anchor,
      box: finalBox,
    });
  }
  // Index by point identity so the render loop can pull placements in
  // original order without re-sorting.
  const placementByPoint = new Map(placements.map((pl) => [pl.point, pl]));

  // Per-model legend chips. Reads top-down with the chart so the
  // user can map name → colour at a glance for crowded plots.
  const legend = points;

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
            Each dot is one model. <strong className="text-fg">Up</strong> = higher pass-rate,{' '}
            <strong className="text-fg">right</strong> = faster mean throughput,{' '}
            <strong className="text-fg">smaller dot</strong> = shorter total bench wall-clock.
            The dashed line connects models on the Pareto frontier — they're not dominated on both
            axes by anyone else, so they're the rational choices for any quality / speed trade-off.
          </p>
        </div>
        <div className="flex max-w-md flex-col items-end gap-2">
          <RunFilter
            candidates={allCandidates}
            excluded={excluded}
            onExcludedChange={setExcluded}
          />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {legend.map((p) => (
              <span
                key={`legend-${p.runId}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover((cur) => (cur === p ? null : cur))}
                className={`inline-flex max-w-[16rem] cursor-default items-center gap-1.5 rounded-full border bg-bg px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  hover === p
                    ? 'border-accent text-fg'
                    : 'border-border text-fg-muted'
                }`}
                title={`${p.id} · ${SOURCE_LABELS[p.source] ?? p.source}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: p.color }}
                />
                <span className="truncate">{shortId(p.id)}</span>
              </span>
            ))}
          </div>
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

          {/* Frontier markers — soft coloured ring under Pareto-
              optimal points. Ring scales with the dot so the ratio
              stays consistent at any size. */}
          {frontier.map((p) => (
            <circle
              key={`ring-${p.runId}`}
              cx={xScale(p.avgTokPerSec)}
              cy={yScale(p.passRate)}
              r={sizeFor(p.totalMs) + 6}
              fill="none"
              stroke={p.color}
              strokeWidth={1.5}
              opacity={0.35}
              className="pointer-events-none"
            />
          ))}

          {/* Data points + permanent labels. Hit-area circle is
              larger than the visual dot for easier hovering on dense
              plots. Labels use paint-order so a stroke-width
              backdrop punches through gridlines for readability. */}
          {points.map((p) => {
            const pl = placementByPoint.get(p);
            if (pl === undefined) return null;
            const isHover = hover === p;
            const r = isHover ? pl.baseR + 4 : pl.baseR;
            return (
              <g
                key={`pt-${p.runId}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover((cur) => (cur === p ? null : cur))}
                onFocus={() => setHover(p)}
                onBlur={() => setHover((cur) => (cur === p ? null : cur))}
                tabIndex={0}
                className="outline-none [&:focus-visible_circle]:stroke-accent"
              >
                <circle
                  cx={pl.cx}
                  cy={pl.cy}
                  r={Math.max(r + 6, 16)}
                  fill="transparent"
                  className="cursor-crosshair"
                />
                <circle
                  cx={pl.cx}
                  cy={pl.cy}
                  r={r}
                  fill={p.color}
                  stroke="rgb(var(--bg-elevated))"
                  strokeWidth={2}
                  style={{ transition: 'r 120ms ease-out' }}
                  className="drop-shadow-sm"
                />
                <text
                  x={pl.textX}
                  y={pl.textY}
                  textAnchor={pl.anchor}
                  className="pointer-events-none font-mono text-[11px] font-medium"
                  style={{
                    fill: p.color,
                    paintOrder: 'stroke',
                    stroke: 'rgb(var(--bg-elevated))',
                    strokeWidth: 4,
                    strokeLinejoin: 'round',
                    opacity: isHover || hover === null ? 1 : 0.5,
                    transition: 'opacity 150ms ease',
                  }}
                >
                  {shortId(p.id)}
                </text>
              </g>
            );
          })}
        </svg>

        {hover !== null ? <Tooltip point={hover} maxTokps={maxTokps} /> : null}

        {/* Size-scale legend — only meaningful when total times
            actually differ across the run. */}
        {fastestPoint !== slowestPoint ? (
          <div className="mt-2 flex items-center justify-end gap-3 px-3 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <svg width={20} height={20} aria-hidden>
                <circle cx={10} cy={10} r={5} className="fill-fg-muted" />
              </svg>
              <span>
                fastest{' '}
                <span className="font-mono text-fg">
                  {(fastestPoint.totalMs / 1000).toFixed(1)} s
                </span>
              </span>
            </span>
            <span className="text-fg-faint">→</span>
            <span className="inline-flex items-center gap-1.5">
              <svg width={28} height={28} aria-hidden>
                <circle cx={14} cy={14} r={11} className="fill-fg-muted" />
              </svg>
              <span>
                slowest{' '}
                <span className="font-mono text-fg">
                  {(slowestPoint.totalMs / 1000).toFixed(1)} s
                </span>
              </span>
            </span>
          </div>
        ) : null}
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
            <tr key={`a11y-${p.runId}`}>
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

/**
 * Filter dropdown shown in the chart header. Lets the user toggle
 * runs in/out of the plot — useful when the same model appears more
 * than once (re-run with different parameters) and the chart gets
 * visually noisy. Default state is "everything included"; the
 * dropdown lists each candidate with a checkbox and a small
 * timestamp so duplicates are distinguishable.
 */
function RunFilter({
  candidates,
  excluded,
  onExcludedChange,
}: {
  candidates: readonly (ModelRunState & { summary: NonNullable<ModelRunState['summary']> })[];
  excluded: ReadonlySet<string>;
  onExcludedChange: (next: ReadonlySet<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const includedCount = candidates.length - excluded.size;
  const toggle = (runId: string) => {
    const next = new Set(excluded);
    if (next.has(runId)) next.delete(runId);
    else next.add(runId);
    onExcludedChange(next);
  };
  const allOn = excluded.size === 0;
  const setAll = (on: boolean) => {
    onExcludedChange(on ? new Set() : new Set(candidates.map((c) => c.runId)));
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
          excluded.size === 0
            ? 'border-border bg-bg text-fg-muted hover:border-accent hover:text-accent'
            : 'border-accent/60 bg-accent/10 text-accent',
        ].join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Pick which runs are plotted"
      >
        <span aria-hidden>⏷</span>
        Filter runs
        <span className="font-mono tabular-nums">
          {includedCount}/{candidates.length}
        </span>
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-30"
            aria-hidden
            onClick={() => setOpen(false)}
            role="button"
            tabIndex={-1}
          />
          <div className="absolute right-0 z-40 mt-1 w-[min(360px,90vw)] rounded-lg border border-border bg-bg-elevated p-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Plotted runs
              </p>
              <button
                type="button"
                onClick={() => setAll(!allOn)}
                className="rounded border border-border bg-bg px-2 py-0.5 font-mono text-[10px] text-fg hover:border-accent hover:text-accent"
              >
                {allOn ? 'Hide all' : 'Show all'}
              </button>
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {candidates.map((c) => {
                const checked = !excluded.has(c.runId);
                return (
                  <label
                    key={c.runId}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-bg-subtle"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.runId)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span
                      aria-hidden
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        background: colourFor(`${c.model.source}::${c.model.id}::${c.model.port}`),
                      }}
                    />
                    <span className="flex-1 truncate font-mono text-[11px] text-fg" title={c.model.id}>
                      {shortId(c.model.id)}
                    </span>
                    <span className="font-mono text-[10px] text-fg-faint">
                      {fmtClockShort(c.startedAt)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function fmtClockShort(epoch: number): string {
  const d = new Date(epoch);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
