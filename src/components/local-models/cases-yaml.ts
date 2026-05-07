import { parse, stringify } from 'yaml';
import type { InlineCase } from './builtin-suite';

/**
 * Portable YAML format for sharing eval cases between users.
 *
 * The on-disk shape is deliberately a thin wrapper around the
 * `InlineCase` array — one extra version field so future additions
 * (e.g. tool specs, image attachments edited via YAML) don't silently
 * corrupt older files.
 *
 * Example:
 *
 *   version: 1
 *   cases:
 *     - id: my-test
 *       input: |
 *         Reply with PASS.
 *       expect:
 *         kind: contains
 *         value: PASS
 *       weight: 1
 *       tags: [custom]
 */

const FILE_VERSION = 1;

interface YamlFile {
  readonly version: number;
  readonly cases: readonly InlineCase[];
}

export function encodeCasesYaml(cases: readonly InlineCase[]): string {
  const doc: YamlFile = { version: FILE_VERSION, cases };
  return stringify(doc, {
    lineWidth: 0,
    blockQuote: 'literal',
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
}

/**
 * Permissive parser. Accepts:
 *   - Our wrapper shape: `{ version, cases: [...] }`
 *   - A bare array of cases (single-doc YAML list)
 *   - A `{ suite: { cases: [...] } }` shape (matches the platform suite layout)
 *
 * Throws when no recognised shape is found, so the caller can show a
 * useful error to the user.
 */
export function decodeCasesYaml(text: string): readonly InlineCase[] {
  const raw = parse(text);
  const cases = extractCases(raw);
  if (cases === null) {
    throw new Error(
      'YAML did not contain a recognised cases array. Expected `{ version, cases: [...] }` or a top-level list of cases.',
    );
  }
  validateShape(cases);
  return cases;
}

function extractCases(raw: unknown): readonly InlineCase[] | null {
  if (Array.isArray(raw)) return raw as readonly InlineCase[];
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.cases)) return obj.cases as readonly InlineCase[];
    if (
      obj.suite !== null &&
      typeof obj.suite === 'object' &&
      Array.isArray((obj.suite as Record<string, unknown>).cases)
    ) {
      return (obj.suite as Record<string, unknown>).cases as readonly InlineCase[];
    }
  }
  return null;
}

function validateShape(cases: readonly InlineCase[]): void {
  for (const c of cases) {
    if (typeof c.id !== 'string' || c.id.trim() === '') {
      throw new Error('Every case needs a non-empty `id` string.');
    }
    if (typeof c.input !== 'string') {
      throw new Error(`Case "${c.id}": \`input\` must be a string.`);
    }
    if (c.expect === null || typeof c.expect !== 'object' || typeof c.expect.kind !== 'string') {
      throw new Error(`Case "${c.id}": \`expect\` must have a \`kind\` field.`);
    }
    if (typeof c.weight !== 'number' || !Number.isFinite(c.weight)) {
      throw new Error(`Case "${c.id}": \`weight\` must be a number.`);
    }
    if (!Array.isArray(c.tags)) {
      throw new Error(`Case "${c.id}": \`tags\` must be an array of strings.`);
    }
  }
}
