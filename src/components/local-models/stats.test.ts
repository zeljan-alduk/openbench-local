/**
 * Golden tests for the statistics layer. Wilson/Newcombe reference
 * values computed independently (R binom::binom.wilson and hand
 * arithmetic) and pinned to 3 decimals.
 */

import { describe, expect, it } from 'vitest';
import type { BenchCaseRow } from './bench-direct';
import {
  formatCI,
  isSignificantDiff,
  newcombeDiffInterval,
  poolRuns,
  runGroupKey,
  wilsonInterval,
} from './stats';

function near(x: number, want: number, eps = 0.001) {
  expect(Math.abs(x - want)).toBeLessThanOrEqual(eps);
}

describe('wilsonInterval', () => {
  it('matches reference values (72/100 @95%)', () => {
    const { lo, hi } = wilsonInterval(72, 100);
    near(lo, 0.6251, 0.0005);
    near(hi, 0.7986, 0.0005);
  });

  it('behaves at the boundaries 0/n and n/n (never negative / above 1)', () => {
    const zero = wilsonInterval(0, 20);
    expect(zero.lo).toBe(0);
    near(zero.hi, 0.1611);
    const full = wilsonInterval(20, 20);
    near(full.lo, 0.8389);
    expect(full.hi).toBe(1);
  });

  it('n=0 → the no-information interval [0,1]', () => {
    expect(wilsonInterval(0, 0)).toEqual({ lo: 0, hi: 1 });
  });

  it('tightens with n', () => {
    const small = wilsonInterval(7, 10);
    const large = wilsonInterval(210, 300);
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo);
  });
});

describe('newcombeDiffInterval / isSignificantDiff', () => {
  it('symmetric: diff(a,b) = -diff(b,a) with bounds swapped', () => {
    const ab = newcombeDiffInterval(72, 100, 60, 100);
    const ba = newcombeDiffInterval(60, 100, 72, 100);
    near(ab.lo, -ba.hi);
    near(ab.hi, -ba.lo);
  });

  it('72/100 vs 75/100 is NOT significant (the motivating example)', () => {
    expect(isSignificantDiff(72, 100, 75, 100)).toBe(false);
    const { lo, hi } = newcombeDiffInterval(75, 100, 72, 100);
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
  });

  it('90/100 vs 60/100 IS significant', () => {
    expect(isSignificantDiff(90, 100, 60, 100)).toBe(true);
    const { lo } = newcombeDiffInterval(90, 100, 60, 100);
    expect(lo).toBeGreaterThan(0);
  });

  it('identical proportions → interval centred on 0', () => {
    const { lo, hi } = newcombeDiffInterval(50, 100, 50, 100);
    near(lo + hi, 0, 0.0001);
  });

  it('degenerate n → the no-information interval', () => {
    expect(newcombeDiffInterval(0, 0, 5, 10)).toEqual({ lo: -1, hi: 1 });
  });
});

describe('formatCI', () => {
  it('renders the compact cell form', () => {
    expect(formatCI(72, 100)).toBe('72% (95% CI 63–80%)');
    expect(formatCI(0, 0)).toBe('—');
  });
});

function row(id: string, passed: boolean, extra?: Partial<BenchCaseRow>): BenchCaseRow {
  return {
    id,
    passed,
    score: passed ? 1 : 0,
    totalMs: 100,
    ttftMs: null,
    tokensIn: null,
    tokensOut: null,
    tokPerSec: null,
    reasoningRatio: null,
    input: 'x',
    expect: { kind: 'exact', value: 'x' },
    output: '',
    reasoningOutput: '',
    toolCalls: [],
    imageDataUrl: null,
    skipped: false,
    ...extra,
  };
}

describe('poolRuns', () => {
  it('pools by case id across runs, excluding skips', () => {
    const runA = { rows: [row('a', true), row('b', false), row('c', false, { skipped: true })] };
    const runB = { rows: [row('a', true), row('b', true)] };
    const pooled = poolRuns([runA, runB]);
    expect(pooled.runCount).toBe(2);
    expect(pooled.passes).toBe(3);
    expect(pooled.total).toBe(4); // 'c' skipped — excluded entirely
    expect(pooled.perCase.find((c) => c.caseId === 'a')).toEqual({ caseId: 'a', passes: 2, attempts: 2 });
  });

  it('uses per-attempt outcomes when a row carries attempts (repeatCount > 1)', () => {
    const repeated = row('a', false, {
      score: 2 / 3,
      attempts: [
        { passed: true, totalMs: 1, tokensOut: null },
        { passed: true, totalMs: 1, tokensOut: null },
        { passed: false, totalMs: 1, tokensOut: null },
      ],
    });
    const pooled = poolRuns([{ rows: [repeated] }]);
    expect(pooled.passes).toBe(2);
    expect(pooled.total).toBe(3);
  });

  it('skipped attempts inside a repeated row are excluded', () => {
    const repeated = row('a', false, {
      attempts: [
        { passed: true, totalMs: 1, tokensOut: null },
        { passed: false, totalMs: 0, tokensOut: null, skipped: true },
      ],
    });
    const pooled = poolRuns([{ rows: [repeated] }]);
    expect(pooled.total).toBe(1);
    expect(pooled.passes).toBe(1);
  });
});

describe('runGroupKey', () => {
  const model = { chatBaseUrl: 'http://127.0.0.1:11434/v1', id: 'llama3.1:8b' };

  it('same model + same params → same key; param change → different key', () => {
    expect(runGroupKey(model, { temperature: 0 })).toBe(runGroupKey(model, { temperature: 0 }));
    expect(runGroupKey(model, { temperature: 0 })).not.toBe(runGroupKey(model, { temperature: 0.7 }));
    expect(runGroupKey(model, {})).not.toBe(
      runGroupKey({ ...model, id: 'llama3.1:70b' }, {}),
    );
  });

  it('ignores non-shaping fields (warmUp, caseTimeoutMs)', () => {
    expect(runGroupKey(model, { warmUp: true, caseTimeoutMs: 60_000 })).toBe(
      runGroupKey(model, { warmUp: false, caseTimeoutMs: 5_000 }),
    );
  });
});
