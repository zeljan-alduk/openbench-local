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
    if (c.generate !== undefined) validateGenerate(c.id, c.generate);
    if (c.acceptWithRemark !== undefined) validateAccept(c.id, c.acceptWithRemark);
    if (c.forgiveFormatting !== undefined && typeof c.forgiveFormatting !== 'boolean') {
      throw new Error(`Case "${c.id}": \`forgiveFormatting\` must be a boolean.`);
    }
    if (c.followUps !== undefined) validateFollowUps(c.id, c.followUps);
    if (c.toolResponders !== undefined) validateToolResponders(c.id, c.toolResponders);
    if (c.sweep !== undefined) validateSweep(c.id, c.sweep);
    if (c.maxToolRounds !== undefined) {
      if (
        typeof c.maxToolRounds !== 'number' ||
        !Number.isInteger(c.maxToolRounds) ||
        c.maxToolRounds < 1
      ) {
        throw new Error(`Case "${c.id}": \`maxToolRounds\` must be a positive integer.`);
      }
    }
  }
}

/** Shape-check a context-sweep block. */
function validateSweep(caseId: string, sweep: unknown): void {
  if (sweep === null || typeof sweep !== 'object') {
    throw new Error(`Case "${caseId}": \`sweep\` must be an object.`);
  }
  const s = sweep as Record<string, unknown>;
  if (s.kind !== 'context') {
    throw new Error(`Case "${caseId}": \`sweep.kind\` must be 'context'.`);
  }
  if (
    !Array.isArray(s.sizes) ||
    s.sizes.length === 0 ||
    !s.sizes.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
  ) {
    throw new Error(`Case "${caseId}": \`sweep.sizes\` must be a non-empty array of positive numbers.`);
  }
  if (
    s.depthPercent !== undefined &&
    (typeof s.depthPercent !== 'number' || s.depthPercent < 0 || s.depthPercent > 100)
  ) {
    throw new Error(`Case "${caseId}": \`sweep.depthPercent\` must be a number 0–100.`);
  }
  if (s.seed !== undefined && typeof s.seed !== 'number') {
    throw new Error(`Case "${caseId}": \`sweep.seed\` must be a number.`);
  }
}

/** Shape-check the scripted follow-up user turns. */
function validateFollowUps(caseId: string, followUps: unknown): void {
  if (!Array.isArray(followUps) || followUps.length === 0) {
    throw new Error(`Case "${caseId}": \`followUps\` must be a non-empty array of strings.`);
  }
  for (const t of followUps as unknown[]) {
    if (typeof t !== 'string' || t.trim() === '') {
      throw new Error(`Case "${caseId}": every \`followUps\` entry must be a non-empty string.`);
    }
  }
}

/** Shape-check the canned tool responders (tool-execution loop). */
function validateToolResponders(caseId: string, responders: unknown): void {
  if (!Array.isArray(responders) || responders.length === 0) {
    throw new Error(`Case "${caseId}": \`toolResponders\` must be a non-empty array.`);
  }
  for (const r of responders as unknown[]) {
    if (r === null || typeof r !== 'object') {
      throw new Error(`Case "${caseId}": each \`toolResponders\` entry must be an object.`);
    }
    const resp = r as Record<string, unknown>;
    if (typeof resp.name !== 'string' || resp.name.trim() === '') {
      throw new Error(`Case "${caseId}": \`toolResponders\` entry needs a non-empty \`name\`.`);
    }
    if (typeof resp.response !== 'string') {
      throw new Error(`Case "${caseId}": responder "${resp.name}" needs a string \`response\`.`);
    }
    if (resp.byArgs !== undefined) {
      if (!Array.isArray(resp.byArgs)) {
        throw new Error(`Case "${caseId}": responder "${resp.name}" \`byArgs\` must be an array.`);
      }
      for (const b of resp.byArgs as unknown[]) {
        const rule = b as Record<string, unknown> | null;
        if (
          rule === null ||
          typeof rule !== 'object' ||
          typeof rule.argsContains !== 'string' ||
          rule.argsContains === '' ||
          typeof rule.response !== 'string'
        ) {
          throw new Error(
            `Case "${caseId}": responder "${resp.name}" \`byArgs\` entries need \`argsContains\` and \`response\` strings.`,
          );
        }
      }
    }
  }
}

/** Shape-check the `acceptWithRemark` list (pass-with-remark alternatives). */
function validateAccept(caseId: string, accept: unknown): void {
  if (!Array.isArray(accept)) {
    throw new Error(`Case "${caseId}": \`acceptWithRemark\` must be an array.`);
  }
  for (const a of accept as unknown[]) {
    if (a === null || typeof a !== 'object') {
      throw new Error(`Case "${caseId}": each \`acceptWithRemark\` entry must be an object.`);
    }
    const clause = a as Record<string, unknown>;
    if (clause.kind !== 'contains' && clause.kind !== 'regex' && clause.kind !== 'exact') {
      throw new Error(
        `Case "${caseId}": \`acceptWithRemark\` kind must be one of contains | regex | exact.`,
      );
    }
    if (typeof clause.value !== 'string' || clause.value === '') {
      throw new Error(`Case "${caseId}": \`acceptWithRemark\` entry needs a non-empty \`value\`.`);
    }
    if (clause.remark !== undefined && typeof clause.remark !== 'string') {
      throw new Error(`Case "${caseId}": \`acceptWithRemark\` \`remark\` must be a string.`);
    }
  }
}

/**
 * Light shape-check for a parameterization block. We don't evaluate the
 * `expr` strings here (that happens at run time, where errors fall back
 * gracefully) — we just make sure `vars` is a map of recognised specs so
 * an obvious typo in a shared YAML fails loudly at import.
 */
function validateGenerate(caseId: string, generate: unknown): void {
  if (generate === null || typeof generate !== 'object') {
    throw new Error(`Case "${caseId}": \`generate\` must be an object with a \`vars\` map.`);
  }
  const vars = (generate as { vars?: unknown }).vars;
  if (vars === null || typeof vars !== 'object' || Array.isArray(vars)) {
    throw new Error(`Case "${caseId}": \`generate.vars\` must be a map of variable specs.`);
  }
  for (const [name, spec] of Object.entries(vars as Record<string, unknown>)) {
    if (spec === null || typeof spec !== 'object') {
      throw new Error(`Case "${caseId}": var "${name}" must be an object.`);
    }
    const s = spec as Record<string, unknown>;
    const hasOne = 'pick' in s || 'int' in s || 'expr' in s;
    if (!hasOne) {
      throw new Error(`Case "${caseId}": var "${name}" needs one of \`pick\`, \`int\`, or \`expr\`.`);
    }
    if ('pick' in s && (!Array.isArray(s.pick) || s.pick.length === 0)) {
      throw new Error(`Case "${caseId}": var "${name}" \`pick\` must be a non-empty array.`);
    }
    if ('int' in s) {
      const r = s.int as { min?: unknown; max?: unknown };
      if (typeof r?.min !== 'number' || typeof r?.max !== 'number') {
        throw new Error(`Case "${caseId}": var "${name}" \`int\` needs numeric \`min\` and \`max\`.`);
      }
    }
    if ('expr' in s && typeof s.expr !== 'string') {
      throw new Error(`Case "${caseId}": var "${name}" \`expr\` must be a string.`);
    }
  }
}
