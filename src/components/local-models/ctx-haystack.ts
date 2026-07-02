/**
 * Context-length sweep — deterministic haystack generation + case
 * expansion.
 *
 * One authored case with a `sweep` block expands at run time into one
 * concrete instance per size (`<id>@<size>`): a seeded filler document
 * of ~size tokens with a needle sentence spliced at a controlled
 * depth. Everything downstream (runner, evaluator, repeats, skips)
 * sees ordinary InlineCases — zero changes there.
 *
 * Determinism contract: same (seed, size, depthPercent) → the same
 * haystack byte-for-byte, on every model in a session and across
 * machines. The needle code is derived from `seed ^ size` so a model
 * can't leak the answer from one size to another.
 *
 * `estimateTokens` is the chars/4 heuristic — sizes are NOMINAL
 * labels (±20% vs any real tokenizer); the UI writes them as "~8k".
 */

import type { InlineCase, SweepSpec } from './builtin-suite';
import type { BenchCaseRow } from './bench-direct';

/** Tiny seeded PRNG — good spread, 4 lines, no deps. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** chars/4 heuristic — the standard English approximation. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const DEFAULT_SEED = 42;
const DEFAULT_DEPTH = 50;

/** The needle: a 6-digit passcode, formatted so it can't collide with filler. */
export function buildNeedle(rng: () => number): { sentence: string; code: string } {
  const digits = Array.from({ length: 6 }, () => Math.floor(rng() * 10));
  const code = digits.join('-');
  return {
    sentence: `The secret passcode for the vault is ${code}.`,
    code,
  };
}

// Filler is seeded sentence-template composition — varied enough that
// the text isn't degenerate repetition an engine could compress away,
// dull enough that nothing competes with the needle.
const SUBJECTS = [
  'The committee', 'A field engineer', 'The northern facility', 'Every quarterly report',
  'The maintenance crew', 'A visiting auditor', 'The archive system', 'The regional office',
  'A senior analyst', 'The logistics team', 'The monitoring station', 'An updated procedure',
  'The equipment inventory', 'A routine inspection', 'The billing department',
] as const;
const VERBS = [
  'reviewed', 'documented', 'scheduled', 'postponed', 'approved', 'catalogued', 'inspected',
  'recalibrated', 'archived', 'consolidated', 'audited', 'relocated', 'summarized', 'flagged',
] as const;
const OBJECTS = [
  'the ventilation records', 'a batch of supply requests', 'the annual safety drill',
  'the visitor logs', 'three pending work orders', 'the backup generators',
  'the corridor lighting plan', 'a set of compliance forms', 'the shipment manifests',
  'the training materials', 'the water sampling results', 'an inventory discrepancy',
  'the parking assignments', 'the cafeteria rotation', 'the badge-access reports',
] as const;
const TAILS = [
  'before the end of the month', 'without any noted exceptions', 'per standard procedure',
  'after a brief delay', 'across both buildings', 'for the third consecutive week',
  'with minor revisions', 'under the new guidelines', 'despite the schedule change',
  'as part of the seasonal review', 'following the updated checklist', 'ahead of the deadline',
] as const;

function fillerSentence(rng: () => number): string {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)] as T;
  return `${pick(SUBJECTS)} ${pick(VERBS)} ${pick(OBJECTS)} ${pick(TAILS)}.`;
}

export interface HaystackOptions {
  readonly targetTokens: number;
  /** 0 = needle at the start, 100 = at the end. */
  readonly depthPercent: number;
  readonly seed: number;
  readonly needleSentence: string;
}

/**
 * Build a ~targetTokens document with the needle spliced at depth.
 * O(n) string building; a 32k-token haystack is ~130 KB — trivial.
 */
export function buildHaystack(opts: HaystackOptions): string {
  const rng = mulberry32(opts.seed);
  const sentences: string[] = [];
  let tokens = 0;
  const budget = Math.max(64, opts.targetTokens) - estimateTokens(opts.needleSentence);
  while (tokens < budget) {
    const s = fillerSentence(rng);
    sentences.push(s);
    tokens += estimateTokens(`${s} `);
  }
  const at = Math.min(
    sentences.length,
    Math.max(0, Math.round((opts.depthPercent / 100) * sentences.length)),
  );
  sentences.splice(at, 0, opts.needleSentence);
  return sentences.join(' ');
}

const SWEEP_TAG = 'ctx-sweep';

/**
 * Internal marker on an expanded instance whose size exceeds the
 * model's known context window: the runner records it as a skipped
 * row (same shape as the capability gate) instead of dispatching a
 * request that the engine would truncate into a meaningless result.
 * Never silently dropped — a hole in the size axis must be visible.
 */
export interface SweepInstance extends InlineCase {
  readonly skipReasonPreset?: string;
}

/**
 * Expand every sweep case in `cases` into per-size instances, in
 * place of the authored case. Non-sweep cases pass through untouched.
 * Generation depends only on (seed, size, depth) — NOT on the model —
 * so every model in a session sees byte-identical haystacks; only the
 * over-context skips differ by `contextTokens`.
 */
export function expandSweeps(
  cases: readonly InlineCase[],
  contextTokens: number | undefined,
): SweepInstance[] {
  const out: SweepInstance[] = [];
  for (const c of cases) {
    if (c.sweep === undefined || c.sweep.kind !== 'context' || c.sweep.sizes.length === 0) {
      out.push(c);
      continue;
    }
    const spec: SweepSpec = c.sweep;
    const depth = spec.depthPercent ?? DEFAULT_DEPTH;
    const baseSeed = spec.seed ?? DEFAULT_SEED;
    for (const size of spec.sizes) {
      // Per-size seed: a memorized answer can't leak across sizes.
      const rng = mulberry32((baseSeed ^ size) >>> 0);
      const needle = buildNeedle(rng);
      const haystack = buildHaystack({
        targetTokens: size,
        depthPercent: depth,
        seed: (baseSeed ^ size ^ 0x9e3779b9) >>> 0,
        needleSentence: needle.sentence,
      });
      const vars = { haystack, needle: needle.code };
      const { sweep: _sweep, ...rest } = c;
      void _sweep;
      const instance: SweepInstance = {
        ...rest,
        id: `${c.id}@${size}`,
        input: fillVars(c.input, vars),
        expect: fillExpectVars(c.expect, vars),
        tags: c.tags.includes(SWEEP_TAG) ? c.tags : [...c.tags, SWEEP_TAG],
        ...(contextTokens !== undefined && size > contextTokens
          ? {
              skipReasonPreset: `exceeds context window (~${fmtK(size)} tokens > ${fmtK(contextTokens)} ctx)`,
            }
          : {}),
      };
      out.push(instance);
    }
  }
  return out;
}

function fmtK(n: number): string {
  return n >= 1024 ? `${Math.round(n / 1024)}k` : String(n);
}

function fillVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

function fillExpectVars(
  expect: InlineCase['expect'],
  vars: Record<string, string>,
): InlineCase['expect'] {
  switch (expect.kind) {
    case 'contains':
    case 'not_contains':
    case 'regex':
    case 'exact':
      return { ...expect, value: fillVars(expect.value, vars) };
    default:
      return expect;
  }
}

/** Recover the sweep family from an expanded instance id ('ctx-needle@8192'). */
export function parseSweepId(id: string): { familyId: string; size: number } | null {
  const m = /^(.+)@(\d+)$/.exec(id);
  if (m === null) return null;
  const size = Number(m[2]);
  if (!Number.isFinite(size) || size <= 0) return null;
  return { familyId: m[1] as string, size };
}

export interface SweepPoint {
  readonly size: number;
  readonly passed: boolean;
  readonly skipped: boolean;
  readonly totalMs: number;
  readonly ttftMs: number | null;
}

/** Group sweep rows by family id, size-ascending — feeds the degradation strip. */
export function rollupSweeps(
  rows: readonly BenchCaseRow[],
): ReadonlyMap<string, readonly SweepPoint[]> {
  const families = new Map<string, SweepPoint[]>();
  for (const row of rows) {
    const parsed = parseSweepId(row.id);
    if (parsed === null) continue;
    const arr = families.get(parsed.familyId) ?? [];
    arr.push({
      size: parsed.size,
      passed: row.passed,
      skipped: row.skipped,
      totalMs: row.totalMs,
      ttftMs: row.ttftMs,
    });
    families.set(parsed.familyId, arr);
  }
  for (const arr of families.values()) arr.sort((a, b) => a.size - b.size);
  return families;
}
