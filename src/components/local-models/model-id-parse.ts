/**
 * Model-id parsing for quantization A/B grouping.
 *
 * Local engines encode base model, parameter count, and quant level
 * in wildly different id shapes:
 *
 *   Ollama     llama3.1:8b-instruct-q4_K_M · qwen2.5:14b · gemma3:4b-it-qat
 *   LM Studio  lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF
 *              qwen/qwen2.5-14b-instruct · model@4bit (MLX)
 *   vLLM       Qwen/Qwen2.5-14B-Instruct-AWQ · TheBloke/X-GPTQ
 *   llama.cpp  Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf
 *
 * `parseModelId` extracts {base, params, quant} heuristically;
 * `quantGroupKey` folds base+params into a coarse key (quant
 * STRIPPED) so two quants of the same model land in one group.
 * Parameter counts are rounded to whole billions for the key — the
 * id says '14b' while engine metadata says '14.8B', and both must
 * group together. Heuristics can mislabel exotic ids; treat results
 * as hints, never as hard joins beyond the A/B view.
 */

import type { DiscoveredLocalModel } from './discovery-direct';

export interface ParsedModelId {
  /** Lowercased base-model name, quant/params/format decorations stripped. */
  readonly base: string;
  /** Parameter-count label rounded to whole billions ('8b'), when found. */
  readonly params: string | null;
  /** Normalized quant label ('q4_k_m', 'awq', '4bit'…), when found. */
  readonly quant: string | null;
}

// Quant markers, ordered specific → generic.
const QUANT_PATTERNS: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  // GGUF-style: q4_K_M, Q5_0, q8_0, q2_K, iq4_xs, q4km spelling variants
  [/(?:^|[-_.:])(i?q\d(?:_[a-z0-9]+)*)(?=$|[-_.:@ ])/i, (m) => (m[1] as string).toLowerCase()],
  // fp16 / f16 / bf16 / fp8 / f32
  [/(?:^|[-_.:@])((?:bf|fp|f)(?:4|8|16|32))(?=$|[-_.:@ ])/i, (m) => (m[1] as string).toLowerCase()],
  // MLX/other: 4bit / 8-bit / int4 / int8
  [/(?:^|[-_.:@])(\d)[-_]?bit(?=$|[-_.:@ ])/i, (m) => `${m[1]}bit`],
  [/(?:^|[-_.:@])(int[48])(?=$|[-_.:@ ])/i, (m) => (m[1] as string).toLowerCase()],
  // Method suffixes: AWQ / GPTQ / EXL2 / MXFP4 / QAT / NF4
  [/(?:^|[-_.:])(awq|gptq|exl2|mxfp4|nf4|qat)(?=$|[-_.:@ ])/i, (m) => (m[1] as string).toLowerCase()],
];

const PARAM_RE = /(?:^|[-_.:/ ])(\d+(?:\.\d+)?)\s?b(?=$|[-_.:@ ])/i;
// Decorations that don't distinguish base models.
const NOISE = /(?:^|[-_.:])(instruct|chat|it|base|gguf|mlx|hf|uncensored|distill(?:ed)?|preview|latest)(?=$|[-_.:@ ])/gi;

export function parseModelId(id: string): ParsedModelId {
  // Namespaces ('lmstudio-community/…') and file extensions don't
  // identify the model — use the last path segment, drop .gguf.
  const lastSegment = (id.split('/').pop() ?? id).replace(/\.gguf$/i, '');
  let rest = lastSegment;

  let quant: string | null = null;
  for (const [re, pick] of QUANT_PATTERNS) {
    const m = re.exec(rest);
    if (m !== null) {
      quant = pick(m);
      rest = `${rest.slice(0, m.index)}${rest.slice(m.index + m[0].length)}`;
      break;
    }
  }

  let params: string | null = null;
  const pm = PARAM_RE.exec(rest);
  if (pm !== null) {
    const n = Number(pm[1]);
    if (Number.isFinite(n) && n > 0) {
      // Round to whole billions: '14.8B' (engine metadata) and '14b'
      // (tag) must produce the same label.
      params = `${Math.max(1, Math.round(n))}b`;
    }
    rest = `${rest.slice(0, pm.index)}${rest.slice(pm.index + pm[0].length)}`;
  }

  const base = rest
    .toLowerCase()
    .replace(NOISE, '')
    .replace(/[-_.:@ ]+$/g, '')
    .replace(/^[-_.:@ ]+/g, '')
    .replace(/[-_.:@ ]{2,}/g, '-');

  return { base: base.length > 0 ? base : lastSegment.toLowerCase(), params, quant };
}

/**
 * Effective quant for a discovered model: id parse first, engine
 * metadata (Ollama quantization_level / LM Studio quantization) as
 * fallback. Null = unknown — and unknown NEVER counts as a distinct
 * variant for A/B admission (old records without meta would otherwise
 * fabricate spurious comparisons).
 */
export function effectiveQuant(model: {
  readonly id: string;
  readonly meta?: { readonly quantization?: string };
}): string | null {
  const fromId = parseModelId(model.id).quant;
  if (fromId !== null) return fromId;
  const fromMeta = model.meta?.quantization;
  return fromMeta !== undefined ? fromMeta.toLowerCase() : null;
}

/**
 * Coarse grouping key: base + params, quant stripped. Params fall
 * back to engine metadata parameter_size ('7.6B' → '8b') when the id
 * has no count.
 */
export function quantGroupKey(model: {
  readonly id: string;
  readonly meta?: { readonly quantization?: string; readonly parameterSize?: string };
}): string {
  const parsed = parseModelId(model.id);
  let params = parsed.params;
  if (params === null && model.meta?.parameterSize !== undefined) {
    const n = Number(/^([\d.]+)/.exec(model.meta.parameterSize)?.[1]);
    if (Number.isFinite(n) && n > 0) params = `${Math.max(1, Math.round(n))}b`;
  }
  return `${parsed.base}::${params ?? '?'}`;
}

/**
 * A/B admission: groups of ≥2 runs whose models share a groupKey AND
 * carry ≥2 DISTINCT known quants. Re-runs of the identical model (or
 * unknown-quant records) never form a group. Used by BOTH the panel
 * and the chart connectors so the two views can't disagree.
 */
export function admitQuantGroups<T extends { readonly model: DiscoveredLocalModel }>(
  runs: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const byGroup = new Map<string, T[]>();
  for (const r of runs) {
    const key = quantGroupKey(r.model);
    const arr = byGroup.get(key) ?? [];
    arr.push(r);
    byGroup.set(key, arr);
  }
  const admitted = new Map<string, readonly T[]>();
  for (const [key, members] of byGroup) {
    const quants = new Set(
      members.map((m) => effectiveQuant(m.model)).filter((q): q is string => q !== null),
    );
    if (quants.size >= 2) admitted.set(key, members);
  }
  return admitted;
}
