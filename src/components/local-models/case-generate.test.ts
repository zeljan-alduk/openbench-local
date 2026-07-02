/**
 * Tests for parameterized-case materialization. The injectable RNG
 * makes sampling deterministic here; production callers omit it and
 * get Math.random.
 */

import { describe, expect, it, vi } from 'vitest';
import type { InlineCase } from './builtin-suite';
import {
  isParameterized,
  materializeCase,
  materializeCases,
  materializeCasesDetailed,
} from './case-generate';

/** mulberry32 — tiny seeded PRNG, good enough to pin sampling. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const template: InlineCase = {
  id: 'count-letters',
  input: "How many times does '{{letter}}' appear in '{{word}}'? Reply with ONLY the number.",
  generate: {
    vars: {
      word: { pick: ['strawberry', 'mississippi'] },
      letter: { pick: ['r', 's'] },
      n: { expr: 'counti(word, letter)' },
    },
  },
  expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
  weight: 1,
  tags: ['reasoning', 'character-level'],
};

describe('materializeCase', () => {
  it('passes plain cases through untouched (same reference)', () => {
    const plain: InlineCase = {
      id: 'p',
      input: 'x',
      expect: { kind: 'exact', value: 'x' },
      weight: 1,
      tags: [],
    };
    expect(materializeCase(plain)).toBe(plain);
  });

  it('is deterministic under a seeded rng and consistent between input and expect', () => {
    const a = materializeCase(template, seeded(7));
    const b = materializeCase(template, seeded(7));
    expect(a).toEqual(b);
    // The derived answer in expect must match a hand-count of the drawn instance.
    const word = /in '(\w+)'/.exec(a.input)?.[1] ?? '';
    const letter = /'(\w)' appear/.exec(a.input)?.[1] ?? '';
    const count = word.split('').filter((ch) => ch === letter).length;
    expect(a.expect).toEqual({ kind: 'regex', value: `^\\s*${count}\\s*$` });
  });

  it('strips the generate block from the materialized case', () => {
    const m = materializeCase(template, seeded(1));
    expect(m.generate).toBeUndefined();
    expect(isParameterized(template)).toBe(true);
    expect(isParameterized(m)).toBe(false);
  });

  it('different seeds draw different instances (anti-contamination)', () => {
    const draws = new Set(
      Array.from({ length: 20 }, (_, i) => materializeCase(template, seeded(i)).input),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it('templates acceptWithRemark values too', () => {
    const withAccept: InlineCase = {
      ...template,
      acceptWithRemark: [{ kind: 'contains', value: '{{n}}', remark: 'number present' }],
    };
    const m = materializeCase(withAccept, seeded(3));
    expect(m.acceptWithRemark?.[0]?.value).toMatch(/^\d+$/);
  });

  it('int vars respect min/max/step', () => {
    const c: InlineCase = {
      id: 'i',
      input: '{{v}}',
      generate: { vars: { v: { int: { min: 10, max: 20, step: 5 } } } },
      expect: { kind: 'exact', value: '{{v}}' },
      weight: 1,
      tags: [],
    };
    for (let s = 0; s < 30; s++) {
      const v = Number(materializeCase(c, seeded(s)).input);
      expect([10, 15, 20]).toContain(v);
    }
  });

  it('falls back to the raw template on a broken expr (warns, never throws)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: InlineCase = {
      ...template,
      generate: { vars: { n: { expr: 'nonexistent.fn(' } } },
    };
    const m = materializeCase(broken, seeded(1));
    expect(m).toBe(broken);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves unknown {{names}} intact so the gap is visible', () => {
    const c: InlineCase = {
      id: 'u',
      input: 'value: {{v}}, missing: {{ghost}}',
      generate: { vars: { v: { pick: [1] } } },
      expect: { kind: 'contains', value: '{{ghost}}' },
      weight: 1,
      tags: [],
    };
    const m = materializeCase(c, seeded(1));
    expect(m.input).toBe('value: 1, missing: {{ghost}}');
  });
});

describe('materializeCasesDetailed', () => {
  it('captures sampled vars keyed by case id, skipping plain cases', () => {
    const plain: InlineCase = {
      id: 'plain',
      input: 'x',
      expect: { kind: 'exact', value: 'x' },
      weight: 1,
      tags: [],
    };
    const { cases, varsByCaseId } = materializeCasesDetailed([plain, template], seeded(9));
    expect(cases).toHaveLength(2);
    expect(varsByCaseId.plain).toBeUndefined();
    const vars = varsByCaseId['count-letters'];
    expect(vars).toBeDefined();
    expect(typeof vars?.word).toBe('string');
    expect(typeof vars?.n).toBe('number');
    // The recorded draw must be the one embedded in the materialized input.
    expect(cases[1]?.input).toContain(String(vars?.word));
  });

  it('materializeCases stays consistent with the detailed variant', () => {
    expect(materializeCases([template], seeded(5))).toEqual(
      materializeCasesDetailed([template], seeded(5)).cases,
    );
  });
});
