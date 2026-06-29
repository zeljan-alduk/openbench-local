/**
 * Browser-side evaluator port for /local-models.
 *
 * Mirrors the subset of `@aldo-ai/eval` that the inlined suite uses:
 *   - contains / not_contains: substring match
 *   - regex:                   `new RegExp(value).test(output.trim())`
 *   - exact:                   `output.trim() === value`
 *   - json_schema:             a hand-rolled subset (type / required /
 *                              properties / enum) — same dialect the
 *                              platform `evaluateJsonSchema` accepts.
 *
 * Importing the platform package directly would pull in node:fs (via
 * @aldo-ai/api-contract → zod's `path()` polyfill chain we hit before).
 * Re-implementing here keeps the page bundle tiny and shippable to the
 * browser without server-only deps.
 */

import type { InlineCase } from './builtin-suite';

export interface EvalOutcome {
  readonly passed: boolean;
  readonly score: number;
  /**
   * Set on a "pass with remark" — a soft pass. The answer was
   * substantively correct but only matched after we normalized away a
   * cosmetic difference (enclosing punctuation, markdown emphasis,
   * Unicode form, or letter case). Counts fully toward the score; the
   * remark is a human-readable note surfaced in the UI so the deviation
   * stays visible instead of being silently accepted or hard-failed.
   */
  readonly remark?: string;
  readonly detail?: unknown;
}

/**
 * Captured tool-call shape the evaluator sees. Mirror of the
 * `CapturedToolCall` shape from `bench-direct.ts` — kept structurally
 * compatible so we don't import across modules just for the type.
 */
export interface EvalToolCall {
  readonly name: string;
  readonly argumentsRaw: string;
}

export interface EvalRowContext {
  readonly content: string;
  readonly toolCalls: readonly EvalToolCall[];
}

/**
 * Evaluate a captured row against the case's `expect` clause. The
 * row carries both the streamed `content` (for text-based evaluator
 * kinds) and the captured `toolCalls` (for the `tool_call` kind).
 */
export function evaluateRow(row: EvalRowContext, expect: InlineCase['expect']): EvalOutcome {
  switch (expect.kind) {
    case 'contains': {
      if (row.content.includes(expect.value)) return binary(true);
      // Soft-pass ladder: the answer is right but wrapped/cased oddly.
      const out = nfkcTrim(row.content);
      const want = nfkcTrim(expect.value);
      if (out.includes(want)) return softPass('Unicode formatting');
      if (out.toLowerCase().includes(want.toLowerCase())) return softPass('letter case');
      return binary(false);
    }
    case 'not_contains':
      // No soft-pass here: this guards against a leak/injection. A loose
      // normalization could let a near-miss slip through, so keep it strict.
      return binary(!row.content.includes(expect.value));
    case 'regex': {
      let re: RegExp;
      try {
        re = new RegExp(expect.value);
      } catch (e) {
        return {
          passed: false,
          score: 0,
          detail: { error: `bad regex: ${(e as Error).message}` },
        };
      }
      // Trim before matching so that a stray trailing newline (common
      // with chat models — Qwen especially likes to append `\n`) doesn't
      // defeat `$` anchors. Mirrors the `exact` evaluator's behavior and
      // matches the spirit of the suite, where some patterns already
      // pad with `\s*` and others don't.
      if (re.test(row.content.trim())) return binary(true);
      // Soft-pass ladder: a correct answer the model wrapped in parens,
      // markdown, a different Unicode form (e.g. CO₂ → CO2), or different
      // case still passes — but with a remark so the deviation is visible.
      const norm = stripWrappers(nfkcTrim(row.content));
      if (re.test(norm)) return softPass('enclosing punctuation, markdown, LaTeX, or Unicode formatting');
      const reCI = new RegExp(expect.value, re.flags.includes('i') ? re.flags : `${re.flags}i`);
      if (reCI.test(norm)) return softPass('letter case');
      return binary(false);
    }
    case 'exact': {
      if (row.content.trim() === expect.value) return binary(true);
      const out = stripWrappers(nfkcTrim(row.content));
      const want = stripWrappers(nfkcTrim(expect.value));
      if (out === want) return softPass('enclosing punctuation, markdown, LaTeX, or Unicode formatting');
      if (out.toLowerCase() === want.toLowerCase()) return softPass('letter case');
      return binary(false);
    }
    case 'json_schema': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.content);
      } catch (e) {
        return {
          passed: false,
          score: 0,
          detail: { errors: [`output is not valid JSON: ${(e as Error).message}`] },
        };
      }
      const errors: string[] = [];
      validate(parsed, expect.schema as Schema, '$', errors);
      return errors.length === 0
        ? { passed: true, score: 1 }
        : { passed: false, score: 0, detail: { errors } };
    }
    case 'tool_call': {
      // Pass when ANY captured tool-call matches name + (optional)
      // args schema. Most providers emit a single call per turn but
      // some emit multiple — we don't punish that as long as the
      // expected one is in there.
      if (row.toolCalls.length === 0) {
        return {
          passed: false,
          score: 0,
          detail: { error: 'model produced no tool_calls (responded as text instead?)' },
        };
      }
      const errors: string[] = [];
      for (const tc of row.toolCalls) {
        if (tc.name !== expect.name) {
          errors.push(`call name "${tc.name}" !== expected "${expect.name}"`);
          continue;
        }
        // Name matched — now check args if a schema was provided.
        if (expect.argsSchema === undefined) {
          return { passed: true, score: 1 };
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(tc.argumentsRaw);
        } catch (e) {
          errors.push(`args for "${tc.name}" not valid JSON: ${(e as Error).message}`);
          continue;
        }
        const argErrors: string[] = [];
        validate(parsed, expect.argsSchema as Schema, '$', argErrors);
        if (argErrors.length === 0) {
          return { passed: true, score: 1 };
        }
        errors.push(`args for "${tc.name}" failed schema: ${argErrors.join('; ')}`);
      }
      return {
        passed: false,
        score: 0,
        detail: {
          errors,
          observedCalls: row.toolCalls.map((tc) => ({ name: tc.name, args: tc.argumentsRaw })),
        },
      };
    }
    default: {
      const _exhaust: never = expect;
      void _exhaust;
      return { passed: false, score: 0, detail: { error: 'unknown evaluator kind' } };
    }
  }
}

/** Back-compat shim for any caller still on the old single-arg signature. */
export function evaluateOutput(output: string, expect: InlineCase['expect']): EvalOutcome {
  return evaluateRow({ content: output, toolCalls: [] }, expect);
}

function binary(ok: boolean): EvalOutcome {
  return ok ? { passed: true, score: 1 } : { passed: false, score: 0 };
}

/** A soft pass: full credit, plus a note on what cosmetic difference we forgave. */
function softPass(reason: string): EvalOutcome {
  return { passed: true, score: 1, remark: `Correct answer; differed only in ${reason}.` };
}

/** Canonical Unicode form + trimmed. NFKC folds subscripts/superscripts/
 * full-width forms, so "CO₂" and "ＣＯ２" both normalize to "CO2". */
function nfkcTrim(s: string): string {
  return s.normalize('NFKC').trim();
}

/**
 * Peel cosmetic wrappers a model commonly adds around a short answer:
 * LaTeX (`\boxed{B}`, `$B$`, `\(B\)`, `\text{B}`), markdown emphasis/code
 * (`**B**`, `` `B` ``), and one or more layers of brackets or quotes
 * (`(B)`, `["B"]`). Reasoning/math models especially love `\boxed{…}`.
 * Only touches the ends and unwraps a single `{…}` group — interior
 * content is left intact, so this can't turn a wrong answer into a right
 * one, only un-dress a right one.
 */
function stripWrappers(s: string): string {
  let t = s.trim();
  let prev = '';
  while (t !== prev) {
    prev = t;
    t = t
      // LaTeX math delimiters: $…$, $$…$$, \(…\), \[…\]
      .replace(/^\$+/, '')
      .replace(/\$+$/, '')
      .replace(/^\\[([]/, '')
      .replace(/\\[)\]]$/, '')
      // LaTeX answer/format macros wrapping the whole answer in {…}
      .replace(/^\\(?:boxed|text|mathrm|mathbf|operatorname)\s*\{([\s\S]*)\}$/, '$1')
      // Markdown emphasis / code
      .replace(/^[*_`~]+/, '')
      .replace(/[*_`~]+$/, '')
      // Brackets and quotes
      .replace(/^[([{"'“”‘’]+/, '')
      .replace(/[)\]}"'“”‘’]+$/, '')
      .trim();
  }
  return t;
}

// ── tiny JSON-schema subset (type / required / properties / enum / items) ───

type Schema = Record<string, unknown>;
type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

function validate(value: unknown, schema: Schema, path: string, errors: string[]): void {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type)
      ? (schema.type as JsonType[])
      : [schema.type as JsonType];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join('|')}, got ${actualType(value)}`);
      return;
    }
  }
  if (Array.isArray(schema.enum)) {
    const ok = (schema.enum as unknown[]).some((v) => deepEqual(v, value));
    if (!ok) errors.push(`${path}: not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (isObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
      }
    }
    if (isObject(schema.properties)) {
      const props = schema.properties as Record<string, Schema>;
      for (const [k, sub] of Object.entries(props)) {
        if (Object.hasOwn(value, k)) {
          validate((value as Record<string, unknown>)[k], sub, `${path}.${k}`, errors);
        }
      }
    }
  }
  if (Array.isArray(value) && isObject(schema.items)) {
    const itemSchema = schema.items as Schema;
    value.forEach((item, idx) => validate(item, itemSchema, `${path}[${idx}]`, errors));
  }
}

function matchesType(value: unknown, t: JsonType): boolean {
  switch (t) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isObject(value);
    default:
      return false;
  }
}

function actualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    if (!ak.every((k, i) => k === bk[i])) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
