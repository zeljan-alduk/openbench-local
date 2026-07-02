/**
 * Parameterized-case materialization.
 *
 * A case may carry a `generate` block (see `InlineCase.generate`). When
 * it does, the case's `input` and its evaluator `value` are `{{var}}`
 * templates, and `generate.vars` says how to sample each variable. This
 * module turns such a template case into a concrete `InlineCase` with a
 * freshly-randomized question and the matching expected answer.
 *
 * Why: famous gotchas ("how many r's in strawberry", "9.11 vs 9.9",
 * bat-and-ball) are all over the public web, so a model can pass by
 * memorizing the one fixed instance. Re-sampling the numbers/words each
 * run forces it to actually compute the answer.
 *
 * Authoring is plain data (YAML/JSON) — no code per case. The expected
 * answer is computed from the sampled vars by a small JS expression
 * (`expr`) evaluated against a curated helper scope. Because this is the
 * user's own browser running the user's own templates, the eval is about
 * robustness (catch and fall back), not sandboxing a hostile input.
 */

import type { CaseGenerator, InlineCase, VarSpec } from './builtin-suite';

/** Helpers available inside an `expr` var, in addition to the earlier vars and `Math`. */
const EXPR_HELPERS = {
  /** Occurrences of `needle` in `haystack`, case-sensitive. */
  count: (haystack: unknown, needle: unknown): number => occurrences(String(haystack), String(needle), false),
  /** Occurrences of `needle` in `haystack`, case-insensitive. */
  counti: (haystack: unknown, needle: unknown): number => occurrences(String(haystack), String(needle), true),
  len: (v: unknown): number => String(v).length,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
};

function occurrences(haystack: string, needle: string, ci: boolean): number {
  if (needle.length === 0) return 0;
  const h = ci ? haystack.toLowerCase() : haystack;
  const n = ci ? needle.toLowerCase() : needle;
  let count = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) count++;
  return count;
}

/**
 * Source of randomness for sampling. Injectable so tests (and any
 * future seeded-run feature) can make materialization deterministic;
 * production callers omit it and get Math.random.
 */
export type Rng = () => number;

/** Sample one variable given the values of the variables declared before it. */
function sampleVar(spec: VarSpec, scope: Record<string, unknown>, rng: Rng): unknown {
  if ('pick' in spec) {
    const choices = spec.pick;
    if (choices.length === 0) throw new Error('pick list is empty');
    return choices[Math.floor(rng() * choices.length)];
  }
  if ('int' in spec) {
    const { min, max, step = 1 } = spec.int;
    if (!(max >= min) || !(step > 0)) throw new Error(`bad int range [${min}, ${max}] step ${step}`);
    const steps = Math.floor((max - min) / step);
    return min + step * Math.floor(rng() * (steps + 1));
  }
  if ('expr' in spec) return evalExpr(spec.expr, scope);
  throw new Error('var spec must have one of: pick, int, expr');
}

/** Evaluate a JS expression with the given vars + helpers + Math in scope. */
function evalExpr(expr: string, scope: Record<string, unknown>): unknown {
  const env: Record<string, unknown> = { ...EXPR_HELPERS, ...scope };
  const names = Object.keys(env);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `"use strict"; return (${expr});`);
  return fn(...names.map((n) => env[n]));
}

/** {{name}} → String(vars[name]); unknown names are left intact so the gap is visible. */
function fillTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

function fillExpect(expect: InlineCase['expect'], vars: Record<string, unknown>): InlineCase['expect'] {
  switch (expect.kind) {
    case 'contains':
    case 'not_contains':
    case 'regex':
    case 'exact':
      return { ...expect, value: fillTemplate(expect.value, vars) };
    default:
      // json_schema / tool_call carry no string value to template.
      return expect;
  }
}

function sampleVars(gen: CaseGenerator, rng: Rng): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(gen.vars)) {
    scope[name] = sampleVar(spec, scope, rng);
  }
  return scope;
}

/** Sampled variable bindings for one materialized case, for persistence. */
export type SampledVars = Readonly<Record<string, string | number>>;

/**
 * Materialize one case. Plain cases pass through untouched. A template
 * case returns a concrete case (templates filled, `generate` stripped so
 * the runner/evaluator treat it normally). On any authoring error we log
 * and return the case unchanged rather than crashing the whole run.
 */
export function materializeCase(c: InlineCase, rng: Rng = Math.random): InlineCase {
  return materializeCaseDetailed(c, rng).case;
}

/** Like `materializeCase`, but also reports the sampled var bindings (null for plain cases / errors). */
export function materializeCaseDetailed(
  c: InlineCase,
  rng: Rng = Math.random,
): { readonly case: InlineCase; readonly vars: SampledVars | null } {
  if (c.generate === undefined) return { case: c, vars: null };
  try {
    const vars = sampleVars(c.generate, rng);
    const { generate: _generate, ...rest } = c;
    void _generate;
    const materialized: InlineCase = {
      ...rest,
      input: fillTemplate(c.input, vars),
      expect: fillExpect(c.expect, vars),
      ...(c.acceptWithRemark !== undefined
        ? {
            acceptWithRemark: c.acceptWithRemark.map((a) => ({
              ...a,
              value: fillTemplate(a.value, vars),
            })),
          }
        : {}),
      ...(c.followUps !== undefined
        ? { followUps: c.followUps.map((t) => fillTemplate(t, vars)) }
        : {}),
      ...(c.toolResponders !== undefined
        ? {
            toolResponders: c.toolResponders.map((r) => ({
              ...r,
              response: fillTemplate(r.response, vars),
              ...(r.byArgs !== undefined
                ? {
                    byArgs: r.byArgs.map((b) => ({
                      ...b,
                      response: fillTemplate(b.response, vars),
                    })),
                  }
                : {}),
            })),
          }
        : {}),
    };
    // Persist only serializable scalars; exotic expr results degrade to strings.
    const flat: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(vars)) {
      flat[k] = typeof v === 'number' ? v : String(v);
    }
    return { case: materialized, vars: flat };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`case "${c.id}": could not materialize generate block — running template as-is.`, e);
    return { case: c, vars: null };
  }
}

/** Materialize a whole suite's worth of cases once (e.g. at the start of a run). */
export function materializeCases(cases: readonly InlineCase[], rng: Rng = Math.random): InlineCase[] {
  return cases.map((c) => materializeCase(c, rng));
}

/**
 * Like `materializeCases`, but also collects the sampled var bindings
 * keyed by case id — stored on the run record so a surprising result
 * can be traced back to the exact drawn instance.
 */
export function materializeCasesDetailed(
  cases: readonly InlineCase[],
  rng: Rng = Math.random,
): { readonly cases: InlineCase[]; readonly varsByCaseId: Readonly<Record<string, SampledVars>> } {
  const out: InlineCase[] = [];
  const varsByCaseId: Record<string, SampledVars> = {};
  for (const c of cases) {
    const { case: materialized, vars } = materializeCaseDetailed(c, rng);
    out.push(materialized);
    if (vars !== null) varsByCaseId[c.id] = vars;
  }
  return { cases: out, varsByCaseId };
}

/** True when a case carries a parameterization block (for UI badges). */
export function isParameterized(c: InlineCase): boolean {
  return c.generate !== undefined;
}
