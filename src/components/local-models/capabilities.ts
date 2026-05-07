/**
 * Per-model capability inference.
 *
 * Local LLM servers (Ollama, LM Studio, vLLM, llama.cpp) don't expose
 * a structured capability list — they only return model ids. So we
 * infer the user-visible capabilities (Vision / Tool Use / Reasoning /
 * Embedding) from name patterns. Heuristics are conservative: when
 * uncertain, we leave the chip off rather than make a false claim.
 *
 * The chips that show up in the model grid mirror the platform's own
 * capability classes, but the surface here is simpler — three ON/OFF
 * affordances a user can scan at a glance.
 */

export type CapabilityKind = 'vision' | 'tool_use' | 'reasoning' | 'embedding';

export interface InferredCapabilities {
  readonly vision: boolean;
  readonly toolUse: boolean;
  readonly reasoning: boolean;
  readonly embedding: boolean;
}

/**
 * Scan the lower-cased model id for known markers. Patterns are
 * deliberately broad — false negatives are fine ("we don't know"
 * is honest), false positives are not.
 */
export function inferCapabilities(modelId: string): InferredCapabilities {
  const id = modelId.toLowerCase();

  // Embedding-only models: short-circuit. They're not chat-capable so
  // tool-use / reasoning / vision are all definitionally false.
  const embedding =
    /\b(embed|embedding|nomic-embed|bge-|gte-|jina-embed|e5-)/.test(id) ||
    id.includes('text-embedding');
  if (embedding) {
    return { vision: false, toolUse: false, reasoning: false, embedding: true };
  }

  // Vision / multimodal markers. Expand as new families ship.
  const vision =
    /\b(vl|vision|llava|qwen2-vl|qwen2.5-vl|qwen3-vl|minicpm-v|cogvlm|moondream|florence|paligemma|janus|internvl)\b/.test(
      id,
    ) ||
    id.includes('-vl-') ||
    id.endsWith('-vl');

  // Reasoning models: explicit "reasoning" marker, or known chain-of-
  // thought families (o1, R1, qwq, qwen3, deepseek-r1, gemini-thinking,
  // o3, claude-reasoning). The qwen3 series in particular streams
  // reasoning_content through the wire.
  const reasoning =
    /\b(reasoning|thinking|qwq|deepseek-r1|llama-r1|magistral|o1|o3-)\b/.test(id) ||
    /\bqwen3\b/.test(id) ||
    /\bqwen3\.\d/.test(id) ||
    id.includes('-r1-') ||
    id.includes('-r1.') ||
    id.endsWith('-r1');

  // Tool-use: most modern instruction-tuned chat models support it.
  // Conservative inference — we only claim it when the family is known
  // to handle structured tool calls reliably.
  const toolUse =
    /\b(qwen|llama-3|llama3|mistral|mixtral|gemma|phi-4|phi4|nemotron|granite|hermes|deepseek|yi-|cohere|command-r|tulu|solar)\b/.test(
      id,
    ) || reasoning;

  return { vision, toolUse, reasoning, embedding: false };
}

export const CAPABILITY_LABELS: Readonly<Record<CapabilityKind, string>> = Object.freeze({
  vision: 'Vision',
  tool_use: 'Tool Use',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
});
