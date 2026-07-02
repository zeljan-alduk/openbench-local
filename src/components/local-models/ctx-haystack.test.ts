/**
 * Determinism and expansion tests for the context-length sweep. The
 * fairness guarantee — every model sees byte-identical haystacks —
 * rests entirely on the seeding pinned here.
 */

import { describe, expect, it } from 'vitest';
import type { InlineCase } from './builtin-suite';
import {
  buildHaystack,
  buildNeedle,
  estimateTokens,
  expandSweeps,
  mulberry32,
  parseSweepId,
  rollupSweeps,
} from './ctx-haystack';
import type { BenchCaseRow } from './bench-direct';

const sweepCase: InlineCase = {
  id: 'ctx-needle',
  input: 'Find the passcode.\n\n{{haystack}}\n\nReply with ONLY the passcode.',
  sweep: { kind: 'context', sizes: [2048, 8192, 32768], depthPercent: 50 },
  expect: { kind: 'contains', value: '{{needle}}' },
  weight: 1,
  tags: ['long-context'],
};

describe('mulberry32 / buildHaystack determinism', () => {
  it('same seed → byte-identical haystacks (cross-model fairness)', () => {
    const opts = { targetTokens: 4096, depthPercent: 50, seed: 1234, needleSentence: 'The needle.' };
    expect(buildHaystack(opts)).toBe(buildHaystack(opts));
  });

  it('different seeds → different documents', () => {
    const a = buildHaystack({ targetTokens: 2048, depthPercent: 50, seed: 1, needleSentence: 'N.' });
    const b = buildHaystack({ targetTokens: 2048, depthPercent: 50, seed: 2, needleSentence: 'N.' });
    expect(a).not.toBe(b);
  });

  it('hits the token budget within tolerance and contains the needle exactly once', () => {
    const needle = 'The secret passcode for the vault is 1-2-3-4-5-6.';
    const doc = buildHaystack({ targetTokens: 8192, depthPercent: 50, seed: 7, needleSentence: needle });
    const tokens = estimateTokens(doc);
    expect(tokens).toBeGreaterThan(8192 * 0.9);
    expect(tokens).toBeLessThan(8192 * 1.15);
    expect(doc.split(needle)).toHaveLength(2);
  });

  it('depthPercent places the needle at the requested end', () => {
    const needle = 'NEEDLE-SENTINEL.';
    const early = buildHaystack({ targetTokens: 2048, depthPercent: 0, seed: 3, needleSentence: needle });
    const late = buildHaystack({ targetTokens: 2048, depthPercent: 100, seed: 3, needleSentence: needle });
    expect(early.indexOf(needle) / early.length).toBeLessThan(0.1);
    expect(late.indexOf(needle) / late.length).toBeGreaterThan(0.9);
  });
});

describe('expandSweeps', () => {
  it('expands one sweep case into per-size instances with filled templates', () => {
    const out = expandSweeps([sweepCase], undefined);
    expect(out.map((c) => c.id)).toEqual(['ctx-needle@2048', 'ctx-needle@8192', 'ctx-needle@32768']);
    for (const inst of out) {
      expect(inst.sweep).toBeUndefined();
      expect(inst.input).not.toContain('{{haystack}}');
      expect(inst.tags).toContain('ctx-sweep');
      const code = (inst.expect as { value: string }).value;
      expect(code).toMatch(/^\d(-\d){5}$/);
      expect(inst.input).toContain(code);
    }
  });

  it('per-size needles differ (no answer leakage across sizes)', () => {
    const out = expandSweeps([sweepCase], undefined);
    const codes = out.map((c) => (c.expect as { value: string }).value);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('is model-independent for generation but marks over-context sizes as preset skips', () => {
    const big = expandSweeps([sweepCase], undefined);
    const small = expandSweeps([sweepCase], 8192);
    // Same content regardless of the cap…
    expect(small.map((c) => c.input)).toEqual(big.map((c) => c.input));
    // …but sizes beyond the window carry the skip preset.
    expect(small[0]?.skipReasonPreset).toBeUndefined();
    expect(small[1]?.skipReasonPreset).toBeUndefined(); // 8192 ≤ 8192
    expect(small[2]?.skipReasonPreset).toMatch(/exceeds context window/);
  });

  it('passes non-sweep cases through untouched', () => {
    const plain: InlineCase = {
      id: 'p',
      input: 'x',
      expect: { kind: 'exact', value: 'x' },
      weight: 1,
      tags: [],
    };
    expect(expandSweeps([plain], 4096)).toEqual([plain]);
  });
});

describe('parseSweepId / rollupSweeps', () => {
  it('round-trips instance ids and rejects non-sweep ids', () => {
    expect(parseSweepId('ctx-needle@8192')).toEqual({ familyId: 'ctx-needle', size: 8192 });
    expect(parseSweepId('plain-case')).toBeNull();
    expect(parseSweepId('weird@0')).toBeNull();
  });

  it('groups rows by family, size-ascending', () => {
    const row = (id: string, passed: boolean, skipped = false): BenchCaseRow => ({
      id,
      passed,
      score: passed ? 1 : 0,
      totalMs: 10,
      ttftMs: null,
      tokensIn: null,
      tokensOut: null,
      tokPerSec: null,
      reasoningRatio: null,
      input: '',
      expect: { kind: 'exact', value: '' },
      output: '',
      reasoningOutput: '',
      toolCalls: [],
      imageDataUrl: null,
      skipped,
    });
    const rolled = rollupSweeps([
      row('ctx-needle@32768', false, true),
      row('ctx-needle@2048', true),
      row('other-case', true),
      row('ctx-needle@8192', false),
    ]);
    expect(rolled.size).toBe(1);
    expect(rolled.get('ctx-needle')?.map((p) => [p.size, p.passed, p.skipped])).toEqual([
      [2048, true, false],
      [8192, false, false],
      [32768, false, true],
    ]);
  });
});
