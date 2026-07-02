/**
 * Golden tests for the deterministic evaluator — the trust core of the
 * whole bench. A silent scoring bug corrupts every number the app has
 * ever produced, so every evaluator kind, the cosmetic soft-pass
 * ladder, and the acceptWithRemark ordering are pinned here.
 */

import { describe, expect, it } from 'vitest';
import type { AcceptClause, InlineCase } from './builtin-suite';
import { evaluateOutput, evaluateRow } from './evaluator-direct';

type Expect = InlineCase['expect'];

function evalText(content: string, exp: Expect, accepts?: readonly AcceptClause[], forgive?: boolean) {
  return evaluateRow({ content, toolCalls: [] }, exp, accepts, forgive);
}

describe('contains / not_contains', () => {
  it('passes on substring, fails otherwise', () => {
    expect(evalText('the answer is 42, obviously', { kind: 'contains', value: '42' }).passed).toBe(true);
    expect(evalText('the answer is 43', { kind: 'contains', value: '42' }).passed).toBe(false);
  });

  it('not_contains inverts and never soft-passes', () => {
    expect(evalText('clean output', { kind: 'not_contains', value: 'SECRET' }).passed).toBe(true);
    const leak = evalText('the SECRET is out', { kind: 'not_contains', value: 'SECRET' }, undefined, true);
    expect(leak.passed).toBe(false);
    expect(leak.remark).toBeUndefined();
  });

  it('contains is strict without forgive, soft-passes case with forgive + remark', () => {
    expect(evalText('PARIS', { kind: 'contains', value: 'Paris' }).passed).toBe(false);
    const soft = evalText('PARIS', { kind: 'contains', value: 'Paris' }, undefined, true);
    expect(soft.passed).toBe(true);
    expect(soft.score).toBe(1);
    expect(soft.remark).toMatch(/letter case/);
  });

  it('contains forgives Unicode form (CO₂ → CO2) only with forgive on', () => {
    expect(evalText('It produces CO₂ gas', { kind: 'contains', value: 'CO2' }).passed).toBe(false);
    const soft = evalText('It produces CO₂ gas', { kind: 'contains', value: 'CO2' }, undefined, true);
    expect(soft.passed).toBe(true);
    expect(soft.remark).toMatch(/Unicode/);
  });
});

describe('regex', () => {
  it('trims trailing whitespace before matching so $ anchors survive chat newlines', () => {
    expect(evalText('42\n', { kind: 'regex', value: '^42$' }).passed).toBe(true);
    expect(evalText('  42  ', { kind: 'regex', value: '^42$' }).passed).toBe(true);
    expect(evalText('42 is the answer', { kind: 'regex', value: '^42$' }).passed).toBe(false);
  });

  it('reports bad patterns as failures with detail, not throws', () => {
    const r = evalText('anything', { kind: 'regex', value: '([' });
    expect(r.passed).toBe(false);
    expect(String((r.detail as { error: string }).error)).toMatch(/bad regex/);
  });

  it('forgive ladder unwraps \\boxed{...} and markdown, with remark', () => {
    expect(evalText('\\boxed{42}', { kind: 'regex', value: '^42$' }).passed).toBe(false);
    const boxed = evalText('\\boxed{42}', { kind: 'regex', value: '^42$' }, undefined, true);
    expect(boxed.passed).toBe(true);
    expect(boxed.remark).toMatch(/LaTeX|punctuation|markdown/);
    const md = evalText('**42**', { kind: 'regex', value: '^42$' }, undefined, true);
    expect(md.passed).toBe(true);
  });

  it('forgive ladder falls back to case-insensitive as the LAST rung', () => {
    const r = evalText('paris', { kind: 'regex', value: '^Paris$' }, undefined, true);
    expect(r.passed).toBe(true);
    expect(r.remark).toMatch(/letter case/);
  });

  it('stripWrappers cannot rescue a wrong answer', () => {
    const r = evalText('(43)', { kind: 'regex', value: '^42$' }, undefined, true);
    expect(r.passed).toBe(false);
  });
});

describe('exact', () => {
  it('trims, then requires identity', () => {
    expect(evalText(' NO\n', { kind: 'exact', value: 'NO' }).passed).toBe(true);
    expect(evalText('NO.', { kind: 'exact', value: 'NO' }).passed).toBe(false);
  });

  it('forgive peels quotes/brackets layers', () => {
    const r = evalText('"[NO]"', { kind: 'exact', value: 'NO' }, undefined, true);
    expect(r.passed).toBe(true);
    expect(r.remark).toBeDefined();
  });
});

describe('json_schema', () => {
  const schema = {
    type: 'object',
    required: ['name', 'age'],
    properties: { name: { type: 'string' }, age: { type: 'integer' }, tag: { enum: ['a', 'b'] } },
  };

  it('validates type / required / properties / enum', () => {
    expect(evalText('{"name":"x","age":3}', { kind: 'json_schema', schema }).passed).toBe(true);
    expect(evalText('{"name":"x"}', { kind: 'json_schema', schema }).passed).toBe(false);
    expect(evalText('{"name":"x","age":3.5}', { kind: 'json_schema', schema }).passed).toBe(false);
    expect(evalText('{"name":"x","age":3,"tag":"c"}', { kind: 'json_schema', schema }).passed).toBe(false);
  });

  it('non-JSON output fails with a parse detail', () => {
    const r = evalText('not json', { kind: 'json_schema', schema });
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r.detail)).toMatch(/not valid JSON/);
  });

  it('items schema applies to every array element', () => {
    const arr = { type: 'array', items: { type: 'integer' } };
    expect(evalText('[1,2,3]', { kind: 'json_schema', schema: arr }).passed).toBe(true);
    expect(evalText('[1,"x"]', { kind: 'json_schema', schema: arr }).passed).toBe(false);
  });
});

describe('tool_call', () => {
  const exp: Expect = {
    kind: 'tool_call',
    name: 'get_weather',
    argsSchema: { type: 'object', required: ['city'], properties: { city: { enum: ['Paris'] } } },
  };

  it('fails with a text-instead hint when no calls were captured', () => {
    const r = evaluateRow({ content: 'The weather is nice.', toolCalls: [] }, exp);
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r.detail)).toMatch(/no tool_calls/);
  });

  it('passes when ANY captured call matches name + args schema', () => {
    const r = evaluateRow(
      {
        content: '',
        toolCalls: [
          { name: 'other_tool', argumentsRaw: '{}' },
          { name: 'get_weather', argumentsRaw: '{"city":"Paris"}' },
        ],
      },
      exp,
    );
    expect(r.passed).toBe(true);
  });

  it('fails on wrong args with observedCalls detail', () => {
    const r = evaluateRow(
      { content: '', toolCalls: [{ name: 'get_weather', argumentsRaw: '{"city":"London"}' }] },
      exp,
    );
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r.detail)).toMatch(/observedCalls/);
  });

  it('name-only expectation passes without args schema', () => {
    const r = evaluateRow(
      { content: '', toolCalls: [{ name: 'get_weather', argumentsRaw: 'malformed{' }] },
      { kind: 'tool_call', name: 'get_weather' },
    );
    expect(r.passed).toBe(true);
  });
});

describe('acceptWithRemark ordering', () => {
  const accepts: readonly AcceptClause[] = [
    { kind: 'exact', value: 'first', remark: 'first clause' },
    { kind: 'contains', value: 'first', remark: 'second clause (broader)' },
  ];

  it('canonical pass returns no remark even when accepts also match', () => {
    const r = evalText('yes', { kind: 'exact', value: 'yes' }, accepts);
    expect(r.passed).toBe(true);
    expect(r.remark).toBeUndefined();
  });

  it('first matching clause wins, in author order', () => {
    const r = evalText('first', { kind: 'exact', value: 'canonical' }, accepts);
    expect(r.passed).toBe(true);
    expect(r.remark).toBe('first clause');
    const r2 = evalText('the first one', { kind: 'exact', value: 'canonical' }, accepts);
    expect(r2.remark).toBe('second clause (broader)');
  });

  it('no clause matched → the canonical failure (with its detail) is returned', () => {
    const r = evalText('nope', { kind: 'json_schema', schema: { type: 'object' } }, accepts);
    expect(r.passed).toBe(false);
    expect(r.detail).toBeDefined();
  });

  it('blank remark falls back to the default note', () => {
    const r = evalText('alt', { kind: 'exact', value: 'canonical' }, [
      { kind: 'exact', value: 'alt', remark: '  ' },
    ]);
    expect(r.remark).toBe('Accepted alternative answer.');
  });
});

describe('evaluateOutput back-compat shim', () => {
  it('behaves as evaluateRow with empty toolCalls', () => {
    expect(evaluateOutput('42', { kind: 'exact', value: '42' }).passed).toBe(true);
    expect(evaluateOutput('x', { kind: 'tool_call', name: 'f' }).passed).toBe(false);
  });
});
