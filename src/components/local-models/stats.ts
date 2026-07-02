/**
 * Statistics for bench results — pure, no DOM, no deps.
 *
 * A pass rate over ~100 cases is a noisy point estimate: 72% vs 75%
 * on the same suite is statistically indistinguishable. Everything
 * here exists to keep the UI honest about that:
 *
 *   - `wilsonInterval`      — 95% CI on one proportion. Chosen over the
 *                             Wald interval because it behaves at 0/n
 *                             and n/n and at small n.
 *   - `newcombeDiffInterval`— CI on p1−p2 (Newcombe 1998, method 10:
 *                             hybrid score). Chosen over Fisher exact
 *                             because it yields an EFFECT-SIZE interval
 *                             that plots directly as error bars and has
 *                             excellent coverage for n ∈ [10, 300] —
 *                             and it's ten lines of arithmetic instead
 *                             of log-gamma tails.
 *   - `poolRuns`            — pool case-level outcomes across repeat
 *                             runs of the same model+params. Attempts
 *                             (not folded rows) are the Bernoulli unit.
 *
 * Caveats the consumers surface: at temperature 0 with a fixed seed,
 * repeat attempts are correlated, so pooled CIs are optimistic — the
 * UI notes this when temperature === 0. Pooled proportions also mix
 * heterogeneous cases, so treat the interval as a diagnostic, not a
 * strict i.i.d. guarantee. With k pairwise comparisons on screen,
 * expect ~5%·k false "significant" flags (no correction applied — an
 * over-corrected "nothing is significant" is less useful here).
 */

import type { BenchCaseRow, RunConfig } from './bench-direct';

export interface Interval {
  /** Lower bound, proportion in [0,1] ([-1,1] for a difference). */
  readonly lo: number;
  readonly hi: number;
}

const Z95 = 1.96;

/** Wilson score interval for `passes` successes out of `n`. n === 0 → [0, 1] (no information). */
export function wilsonInterval(passes: number, n: number, z: number = Z95): Interval {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = passes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Newcombe hybrid-score interval (method 10) for the difference
 * p1 − p2. Bounds derive from the two Wilson intervals:
 *   lo = d − √((p̂1−l1)² + (u2−p̂2)²),  hi = d + √((u1−p̂1)² + (p̂2−l2)²)
 */
export function newcombeDiffInterval(
  passes1: number,
  n1: number,
  passes2: number,
  n2: number,
  z: number = Z95,
): Interval {
  if (n1 <= 0 || n2 <= 0) return { lo: -1, hi: 1 };
  const p1 = passes1 / n1;
  const p2 = passes2 / n2;
  const w1 = wilsonInterval(passes1, n1, z);
  const w2 = wilsonInterval(passes2, n2, z);
  const d = p1 - p2;
  return {
    lo: d - Math.sqrt((p1 - w1.lo) ** 2 + (w2.hi - p2) ** 2),
    hi: d + Math.sqrt((w1.hi - p1) ** 2 + (p2 - w2.lo) ** 2),
  };
}

/** True when the 95% Newcombe interval for p1 − p2 excludes 0. */
export function isSignificantDiff(
  passes1: number,
  n1: number,
  passes2: number,
  n2: number,
): boolean {
  const { lo, hi } = newcombeDiffInterval(passes1, n1, passes2, n2);
  return lo > 0 || hi < 0;
}

/** '62% (95% CI 52–71%)' — the compact form used in summary cells. */
export function formatCI(passes: number, n: number): string {
  if (n <= 0) return '—';
  const pct = Math.round((passes / n) * 100);
  const { lo, hi } = wilsonInterval(passes, n);
  return `${pct}% (95% CI ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)`;
}

// ── multi-run pooling ────────────────────────────────────────────────

export interface PooledCase {
  readonly caseId: string;
  readonly passes: number;
  readonly attempts: number;
}

export interface PooledRuns {
  readonly runCount: number;
  /** Σ per-case passes across all runs (attempt-level when available). */
  readonly passes: number;
  /** Σ per-case attempts. Skipped rows/attempts excluded. */
  readonly total: number;
  readonly perCase: readonly PooledCase[];
}

/**
 * Pool case-level outcomes across runs of the same benchmark. Keys on
 * `row.id` (parameterized cases re-draw their concrete `input` every
 * run, so ids — not inputs — are the join key). Uses per-attempt
 * outcomes when rows carry `attempts` (repeatCount > 1), else the
 * folded row boolean. Callers should only pool runs with the same
 * suite composition (same suiteVersion / case-id set).
 */
export function poolRuns(
  runs: ReadonlyArray<{ readonly rows: readonly BenchCaseRow[] }>,
): PooledRuns {
  const byCase = new Map<string, { passes: number; attempts: number }>();
  for (const run of runs) {
    for (const row of run.rows) {
      if (row.skipped) continue;
      const slot = byCase.get(row.id) ?? { passes: 0, attempts: 0 };
      if (row.attempts !== undefined && row.attempts.length > 0) {
        for (const a of row.attempts) {
          if (a.skipped === true) continue;
          slot.attempts += 1;
          if (a.passed) slot.passes += 1;
        }
      } else {
        slot.attempts += 1;
        if (row.passed) slot.passes += 1;
      }
      byCase.set(row.id, slot);
    }
  }
  let passes = 0;
  let total = 0;
  const perCase: PooledCase[] = [];
  for (const [caseId, s] of byCase) {
    passes += s.passes;
    total += s.attempts;
    perCase.push({ caseId, passes: s.passes, attempts: s.attempts });
  }
  return { runCount: runs.length, passes, total, perCase };
}

/**
 * Grouping key for "the same benchmark": endpoint + model id + the
 * effective sampling params that shape output. Two runs share a group
 * iff pooling them is meaningful.
 */
export function runGroupKey(
  model: { readonly chatBaseUrl: string; readonly id: string },
  runConfig: RunConfig,
): string {
  const cfg = {
    temperature: runConfig.temperature ?? null,
    topP: runConfig.topP ?? null,
    maxTokens: runConfig.maxTokens ?? null,
    seed: runConfig.seed ?? null,
    reasoningEffort: runConfig.reasoningEffort ?? null,
    systemPrompt: runConfig.systemPrompt ?? null,
    repeatCount: runConfig.repeatCount ?? null,
  };
  return `${model.chatBaseUrl}::${model.id}::${JSON.stringify(cfg)}`;
}
