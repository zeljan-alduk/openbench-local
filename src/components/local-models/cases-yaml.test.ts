/**
 * Round-trip and validation tests for the portable YAML case format.
 * The critical property: unknown/future fields must survive the
 * encode→decode cycle untouched (the validator is permissive by
 * design), because new case types travel through YAML before the
 * structured editor learns to render them.
 */

import { describe, expect, it } from 'vitest';
import type { InlineCase } from './builtin-suite';
import { decodeCasesYaml, encodeCasesYaml } from './cases-yaml';

const base: InlineCase = {
  id: 'rt-1',
  input: 'Reply with PASS.',
  expect: { kind: 'contains', value: 'PASS' },
  weight: 1,
  tags: ['custom'],
};

describe('round-trip', () => {
  it('encode → decode preserves a full-featured case', () => {
    const rich: InlineCase = {
      ...base,
      acceptWithRemark: [{ kind: 'exact', value: 'pass', remark: 'lowercase ok' }],
      forgiveFormatting: true,
      generate: { vars: { n: { int: { min: 1, max: 9 } }, w: { pick: ['a', 'b'] }, d: { expr: 'n * 2' } } },
      requires: 'tool_use',
      tools: [{ type: 'function', function: { name: 'f', parameters: { type: 'object' } } }],
    };
    const decoded = decodeCasesYaml(encodeCasesYaml([rich]));
    expect(decoded).toEqual([rich]);
  });

  it('unknown/future fields survive the round-trip verbatim', () => {
    const future = {
      ...base,
      followUps: ['And now in French.'],
      toolResponders: [{ name: 'f', response: '{"ok":true}' }],
      someFutureField: { nested: [1, 2] },
    } as unknown as InlineCase;
    const decoded = decodeCasesYaml(encodeCasesYaml([future]));
    expect(decoded).toEqual([future]);
  });
});

describe('accepted input shapes', () => {
  it('accepts the wrapper, a bare list, and a { suite: { cases } } block', () => {
    const yamlWrapper = encodeCasesYaml([base]);
    expect(decodeCasesYaml(yamlWrapper)).toHaveLength(1);
    const bare = `- id: rt-1\n  input: x\n  expect: { kind: contains, value: x }\n  weight: 1\n  tags: []\n`;
    expect(decodeCasesYaml(bare)).toHaveLength(1);
    const suiteShape = `suite:\n  cases:\n    - id: rt-1\n      input: x\n      expect: { kind: contains, value: x }\n      weight: 1\n      tags: []\n`;
    expect(decodeCasesYaml(suiteShape)).toHaveLength(1);
  });

  it('rejects YAML without a recognisable cases array', () => {
    expect(() => decodeCasesYaml('just: a-map')).toThrow(/recognised cases array/);
  });
});

describe('validation errors are loud and name the case', () => {
  it.each([
    ['missing id', `- input: x\n  expect: { kind: contains, value: x }\n  weight: 1\n  tags: []`, /non-empty `id`/],
    ['missing expect kind', `- id: bad\n  input: x\n  expect: { value: x }\n  weight: 1\n  tags: []`, /`expect` must have a `kind`/],
    ['non-numeric weight', `- id: bad\n  input: x\n  expect: { kind: contains, value: x }\n  weight: heavy\n  tags: []`, /`weight` must be a number/],
    ['empty pick', `- id: bad\n  input: x\n  expect: { kind: contains, value: x }\n  weight: 1\n  tags: []\n  generate: { vars: { v: { pick: [] } } }`, /non-empty array/],
    ['non-numeric int', `- id: bad\n  input: x\n  expect: { kind: contains, value: x }\n  weight: 1\n  tags: []\n  generate: { vars: { v: { int: { min: a, max: b } } } }`, /numeric `min` and `max`/],
    ['bad accept kind', `- id: bad\n  input: x\n  expect: { kind: contains, value: x }\n  weight: 1\n  tags: []\n  acceptWithRemark: [{ kind: json_schema, value: x }]`, /kind must be one of/],
  ])('%s', (_name, yaml, message) => {
    expect(() => decodeCasesYaml(yaml)).toThrow(message);
  });
});
