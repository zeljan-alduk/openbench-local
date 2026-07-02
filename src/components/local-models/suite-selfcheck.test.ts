/**
 * Suite self-check — mechanical invariants over EVERY built-in case.
 * This is the net under the expanded (partly agent-authored) suite:
 * a case that fails here would either crash the runner, skip when it
 * shouldn't, or silently grade wrong.
 */

import { describe, expect, it } from 'vitest';
import { LOCAL_MODEL_RATING_SUITE } from './builtin-suite';
import { materializeCase } from './case-generate';

const CASES = LOCAL_MODEL_RATING_SUITE.cases;

/** mulberry32 — deterministic sampling for the materialization sweep. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('suite shape', () => {
  it('has unique, kebab-case ids', () => {
    // 'code-bigO-nested' predates the kebab rule and anchors stored
    // runs — grandfathered rather than renamed.
    const LEGACY_IDS = new Set(['code-bigO-nested']);
    const seen = new Set<string>();
    for (const c of CASES) {
      expect(c.id, `duplicate id: ${c.id}`).toSatisfy(() => !seen.has(c.id));
      seen.add(c.id);
      if (!LEGACY_IDS.has(c.id)) expect(c.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('every case has positive weight, non-empty tags, non-empty input', () => {
    for (const c of CASES) {
      expect(c.weight, c.id).toBeGreaterThan(0);
      expect(c.tags.length, c.id).toBeGreaterThan(0);
      expect(c.input.trim().length, c.id).toBeGreaterThan(0);
    }
  });

  it('capability gates are consistent: image ⇔ requires vision; tools ⇒ requires tool_use', () => {
    for (const c of CASES) {
      if (c.image !== undefined) expect(c.requires, `${c.id} has image`).toBe('vision');
      if (c.requires === 'vision') expect(c.image, `${c.id} requires vision`).toBeDefined();
      if (c.tools !== undefined && c.tools.length > 0) {
        expect(c.requires, `${c.id} carries tools`).toBe('tool_use');
      }
      if (c.toolResponders !== undefined) {
        expect(c.tools !== undefined && c.tools.length > 0, `${c.id} has responders but no tools`).toBe(true);
      }
    }
  });

  it('followUps / toolResponders / sweep blocks are well-formed', () => {
    for (const c of CASES) {
      if (c.followUps !== undefined) {
        expect(c.followUps.length, c.id).toBeGreaterThan(0);
        for (const t of c.followUps) expect(t.trim().length, c.id).toBeGreaterThan(0);
      }
      if (c.toolResponders !== undefined) {
        for (const r of c.toolResponders) {
          expect(r.name.trim().length, c.id).toBeGreaterThan(0);
          expect(typeof r.response, c.id).toBe('string');
        }
      }
      if (c.sweep !== undefined) {
        expect(c.sweep.kind, c.id).toBe('context');
        expect(c.sweep.sizes.length, c.id).toBeGreaterThan(0);
        expect(c.input, `${c.id} sweep needs {{haystack}}`).toContain('{{haystack}}');
      }
    }
  });
});

describe('materialization sweep (25 seeds per parameterized case)', () => {
  const TEMPLATE_RE = /\{\{\s*[A-Za-z_$][\w$]*\s*\}\}/;

  it('every generate block fills ALL templates (no broken exprs, no undeclared vars)', () => {
    for (const c of CASES) {
      if (c.generate === undefined) continue;
      for (let s = 1; s <= 25; s++) {
        const m = materializeCase(c, seeded(s * 7919));
        // materializeCase falls back to the raw template on any expr
        // error — an unfilled {{...}} is exactly that failure surfaced.
        expect(m.input, `${c.id} seed ${s}: unfilled template in input`).not.toMatch(TEMPLATE_RE);
        if ('value' in m.expect) {
          expect(m.expect.value, `${c.id} seed ${s}: unfilled template in expect`).not.toMatch(
            TEMPLATE_RE,
          );
          expect(m.expect.value.length, `${c.id} seed ${s}: empty expected value`).toBeGreaterThan(0);
        }
        for (const a of m.acceptWithRemark ?? []) {
          expect(a.value, `${c.id} seed ${s}: unfilled template in accept`).not.toMatch(TEMPLATE_RE);
        }
        for (const t of m.followUps ?? []) {
          expect(t, `${c.id} seed ${s}: unfilled template in followUp`).not.toMatch(TEMPLATE_RE);
        }
        for (const r of m.toolResponders ?? []) {
          expect(r.response, `${c.id} seed ${s}: unfilled template in responder`).not.toMatch(
            TEMPLATE_RE,
          );
        }
      }
    }
  });

  it('every regex evaluator compiles after materialization', () => {
    for (const c of CASES) {
      for (let s = 1; s <= 10; s++) {
        const m = materializeCase(c, seeded(s * 104729));
        if (m.expect.kind === 'regex') {
          expect(() => new RegExp((m.expect as { value: string }).value), `${c.id} seed ${s}`).not.toThrow();
        }
        for (const a of m.acceptWithRemark ?? []) {
          if (a.kind === 'regex') {
            expect(() => new RegExp(a.value), `${c.id} accept seed ${s}`).not.toThrow();
          }
        }
      }
    }
  });

  it('json_schema and tool_call cases carry structurally sane schemas', () => {
    for (const c of CASES) {
      if (c.expect.kind === 'json_schema') {
        expect(typeof c.expect.schema, c.id).toBe('object');
      }
      if (c.expect.kind === 'tool_call') {
        expect(c.expect.name.trim().length, c.id).toBeGreaterThan(0);
        expect(c.requires, `${c.id} tool_call evaluator needs the gate`).toBe('tool_use');
      }
      for (const tool of c.tools ?? []) {
        expect(tool.type, c.id).toBe('function');
        expect(tool.function.name.trim().length, c.id).toBeGreaterThan(0);
        expect(typeof tool.function.parameters, c.id).toBe('object');
      }
    }
  });
});

describe('suite size', () => {
  it('carries the expanded case count', () => {
    // ~100 originals + ~200 expansion. Exact count pinned so an
    // accidental drop of a spread/import fails loudly; update the
    // number deliberately when cases are added or removed.
    expect(CASES.length).toBeGreaterThanOrEqual(290);
  });
});
