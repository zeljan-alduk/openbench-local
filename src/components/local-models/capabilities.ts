/**
 * Per-model capability inference + engine-truth resolution.
 *
 * Local LLM servers return model ids, and — on Ollama and newer
 * LM Studio builds — a structured capability list we can fetch after
 * discovery (see `engine-metadata.ts`). Name-pattern heuristics remain
 * the fallback for vLLM, llama.cpp (except vision via /props), older
 * LM Studio, and the window between scan and enrichment.
 *
 * `resolveCapabilities` merges the two per field: an engine-reported
 * flag wins when present; an absent flag falls back to the heuristic.
 * Provenance is tracked per field so the UI never claims
 * "engine-reported" for a flag that was actually name-inferred
 * (llama.cpp, for example, reports only vision).
 *
 * Heuristics are deliberately broad on families but conservative on
 * claims: a false "we don't know" is honest; a false capability claim
 * turns silent skips into visible failures — for vision that is the
 * intended trade-off, for tool-use we only list families known to
 * emit structured tool calls.
 */

export type CapabilityKind = 'vision' | 'tool_use' | 'reasoning' | 'embedding';

export interface InferredCapabilities {
  readonly vision: boolean;
  readonly toolUse: boolean;
  readonly reasoning: boolean;
  readonly embedding: boolean;
}

/** Per-field flags as reported by the engine. Absent field = engine didn't say. */
export interface EngineCapabilityFlags {
  readonly vision?: boolean;
  readonly toolUse?: boolean;
  readonly reasoning?: boolean;
  readonly embedding?: boolean;
}

/** Engine-truth model metadata attached to a discovered model post-scan. */
export interface ModelEngineMeta {
  readonly capabilities?: EngineCapabilityFlags;
  /** e.g. "Q4_K_M" (Ollama quantization_level / LM Studio quantization). */
  readonly quantization?: string;
  /** LM Studio arch, e.g. "qwen2_vl". */
  readonly arch?: string;
  /** Ollama details.family, e.g. "gemma3". */
  readonly family?: string;
  /** Ollama details.parameter_size, e.g. "7.6B". */
  readonly parameterSize?: string;
}

export type CapabilitySource = 'engine' | 'inferred';

export type CapabilityField = 'vision' | 'toolUse' | 'reasoning' | 'embedding';

export interface ResolvedCapabilities extends InferredCapabilities {
  /** Per-field provenance — 'engine' only when the engine reported THAT field. */
  readonly sources: Readonly<Record<CapabilityField, CapabilitySource>>;
}

/**
 * Scan the lower-cased model id for known markers. `\b` fails across
 * digit→letter joints (`qwen2.5vl`), so common tags are spelled out
 * and the bare `vl` / `o1` tokens are matched with explicit
 * non-alphanumeric delimiters instead.
 */
export function inferCapabilities(modelId: string): InferredCapabilities {
  const id = modelId.toLowerCase();

  // Embedding-only models: short-circuit. They're not chat-capable so
  // tool-use / reasoning / vision are all definitionally false.
  const embedding =
    /(embed|embedding|nomic-embed|bge-|gte-|jina-embed|e5-|all-minilm|minilm|paraphrase-|reranker)/.test(
      id,
    ) || id.includes('text-embedding');
  if (embedding) {
    return { vision: false, toolUse: false, reasoning: false, embedding: true };
  }

  // Vision / multimodal markers. gemma3 is vision-capable EXCEPT the
  // text-only 270m/1b sizes and gemma3n — the scan class includes the
  // ':'/'-' separators so the size suffix is actually reachable.
  // Spellings verified: gemma3:12b → vision (no literal '1b' token),
  // gemma3:1b / gemma3:270m / gemma-3-1b-it → excluded, gemma3n → excluded.
  const vision =
    /(vision|llava|bakllava|moondream|minicpm-v|minicpm-o|qwen2\.5vl|qwen2[.-]5-vl|qwen2-vl|qwen3-?vl|internvl|cogvlm|smolvlm|pixtral|paligemma|florence|janus|magma|idefics|glm-?4\.?[15]?v|phi-?4-?multimodal|mistral-small3\.[12]|llama-?4|granite-vision)/.test(
      id,
    ) ||
    /gemma-?3(?!n)(?![-:\w.]*(?:270m|1b)\b)/.test(id) ||
    id.includes('-vl-') ||
    id.endsWith('-vl') ||
    /(^|[^a-z0-9])vl([^a-z0-9]|$)/.test(id);

  // Reasoning families: explicit markers plus known chain-of-thought
  // model lines. Bare `o1` stays delimiter-guarded so ids merely
  // containing the substring (e.g. "solar-pro1") aren't flagged.
  const reasoning =
    /(reasoning|thinking|qwq|deepseek-r1|gpt-oss|magistral|exaone-deep|phi-?4-(?:mini-)?reasoning|openthinker|smallthinker|glm-z1|cogito|o3-)/.test(
      id,
    ) ||
    /qwen-?3(?!-vl)/.test(id) ||
    /(^|[^a-z0-9])o1([^a-z0-9]|$)/.test(id) ||
    id.includes('-r1-') ||
    id.includes('-r1.') ||
    id.endsWith('-r1');

  // Tool-use: families known to handle structured tool calls reliably.
  const toolUse =
    /(qwen|llama-?[34]|llama3|mistral|ministral|mixtral|devstral|gemma|phi-?4|nemotron|granite|hermes|deepseek|glm-?4|kimi|minimax|smollm2|functionary|firefunction|command-[ra]|aya-expanse|seed-oss|yi-|cohere|tulu|solar)/.test(
      id,
    ) || reasoning;

  return { vision, toolUse, reasoning, embedding: false };
}

/**
 * Merge engine-reported capability flags over the name heuristics.
 * Engine value wins per field WHEN PRESENT; an absent field falls back
 * to the heuristic and keeps `sources.<field> === 'inferred'`.
 */
export function resolveCapabilities(
  modelId: string,
  meta?: ModelEngineMeta,
): ResolvedCapabilities {
  const inferred = inferCapabilities(modelId);
  const eng = meta?.capabilities;
  const pick = (field: CapabilityField): { value: boolean; source: CapabilitySource } => {
    const reported = eng?.[field];
    return reported === undefined
      ? { value: inferred[field], source: 'inferred' }
      : { value: reported, source: 'engine' };
  };
  const vision = pick('vision');
  const toolUse = pick('toolUse');
  const reasoning = pick('reasoning');
  const embedding = pick('embedding');
  return {
    vision: vision.value,
    toolUse: toolUse.value,
    reasoning: reasoning.value,
    embedding: embedding.value,
    sources: {
      vision: vision.source,
      toolUse: toolUse.source,
      reasoning: reasoning.source,
      embedding: embedding.source,
    },
  };
}

export const CAPABILITY_LABELS: Readonly<Record<CapabilityKind, string>> = Object.freeze({
  vision: 'Vision',
  tool_use: 'Tool Use',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
});
