import { readApiKey } from './auth-store';
import type { RunConfig } from './bench-direct';
import type { DiscoveredLocalModel, DiscoverySource } from './discovery-direct';

/**
 * Pull the model's default sampling parameters straight from the
 * engine, so the per-model config in the gear modal can be seeded
 * with what the engine *actually* uses — instead of the user having
 * to remember what they set in Ollama's Modelfile or llama.cpp's CLI
 * flags.
 *
 * Coverage by engine (as of late 2025):
 *
 *   - Ollama   → POST /api/show  → full Modelfile (parameters + system)
 *   - llama.cpp→ GET  /props      → default_generation_settings block
 *   - LM Studio→ GET  /api/v0/models/{id} → metadata only; sampling
 *                                            defaults aren't exposed
 *                                            via API (they live in the
 *                                            desktop config file)
 *   - vLLM     → not supported; runtime defaults are launch-time CLI
 *                flags and aren't surfaced over HTTP.
 *
 * We map only the fields openbench-local actually sends on the chat
 * completion: temperature, top_p, seed, max_tokens, system prompt,
 * reasoning_effort. Engine-specific knobs (top_k, repeat_penalty,
 * num_ctx, mirostat …) are surfaced in `extras` for display so the
 * user can see them — but we don't try to forward those over the
 * OpenAI-compat surface.
 */

// RunConfig declares its fields readonly, but we need a mutable
// scratch object during parsing. Strip the readonly modifier locally.
type MutableRunConfig = { -readonly [K in keyof RunConfig]?: RunConfig[K] };

export interface PulledDefaults {
  readonly source: DiscoverySource;
  /** True when the engine returned a usable response (even if empty). */
  readonly ok: boolean;
  /** Subset of the pulled config that maps onto our RunConfig shape. */
  readonly runConfig: Partial<RunConfig>;
  /** Engine-specific extras (top_k, num_ctx, repeat_penalty …) — display only. */
  readonly extras: Readonly<Record<string, string | number>>;
  /** Human-readable hint to surface in the modal. */
  readonly note?: string;
  /** Set when the request itself failed (CORS, 401, network). */
  readonly error?: string;
}

const NOT_SUPPORTED_VLLM =
  "vLLM doesn't expose runtime defaults via API — they're set at launch time with --temperature, --top-p, --max-model-len, etc.";

const LMSTUDIO_NO_SAMPLING =
  "LM Studio's REST API doesn't expose sampling defaults (temperature, top_p, …) — they live in the desktop app's per-model preset. Set them by hand here.";

export async function pullEngineDefaults(
  model: DiscoveredLocalModel,
): Promise<PulledDefaults> {
  try {
    switch (model.source) {
      case 'ollama':
        return await pullOllama(model);
      case 'llamacpp':
        return await pullLlamaCpp(model);
      case 'lmstudio':
        return await pullLmStudio(model);
      case 'vllm':
        return {
          source: 'vllm',
          ok: false,
          runConfig: {},
          extras: {},
          note: NOT_SUPPORTED_VLLM,
        };
    }
  } catch (e) {
    return {
      source: model.source,
      ok: false,
      runConfig: {},
      extras: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function authHeaders(host: string, port: number): Record<string, string> {
  const key = readApiKey(host, port);
  return key !== null ? { authorization: `Bearer ${key}` } : {};
}

/** Ollama exposes a flat newline-separated `key value` blob in `parameters`. */
async function pullOllama(m: DiscoveredLocalModel): Promise<PulledDefaults> {
  const base = m.chatBaseUrl.replace(/\/v1\/?$/, '');
  const res = await fetch(`${base}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(m.host, m.port) },
    body: JSON.stringify({ name: m.id }),
  });
  if (!res.ok) {
    return { source: 'ollama', ok: false, runConfig: {}, extras: {}, error: `HTTP ${res.status}` };
  }
  const body = (await res.json()) as {
    parameters?: string;
    system?: string;
  };
  const cfg: MutableRunConfig = {};
  const extras: Record<string, string | number> = {};
  if (typeof body.parameters === 'string') {
    for (const line of body.parameters.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const idx = trimmed.indexOf(' ');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      // Strip quotes if present; values can be quoted strings (e.g. `stop "<|im_end|>"`).
      const rawVal = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      const num = Number(rawVal);
      const isNum = Number.isFinite(num);
      switch (key) {
        case 'temperature':
          if (isNum) cfg.temperature = num;
          break;
        case 'top_p':
          if (isNum) cfg.topP = num;
          break;
        case 'seed':
          if (isNum) cfg.seed = num;
          break;
        case 'num_predict':
          if (isNum && num > 0) cfg.maxTokens = num;
          break;
        // Engine-specific extras (display only — not part of OpenAI-compat body):
        case 'top_k':
        case 'repeat_penalty':
        case 'repeat_last_n':
        case 'num_ctx':
        case 'tfs_z':
        case 'typical_p':
        case 'min_p':
          extras[key] = isNum ? num : rawVal;
          break;
        case 'stop':
          // Multiple `stop "..."` lines — append.
          extras.stop = `${extras.stop !== undefined ? `${extras.stop} | ` : ''}${rawVal}`;
          break;
        default:
          // Unknown key — surface as extra so user can see it.
          extras[key] = isNum ? num : rawVal;
      }
    }
  }
  if (typeof body.system === 'string' && body.system.trim().length > 0) {
    cfg.systemPrompt = body.system;
  }
  return { source: 'ollama', ok: true, runConfig: cfg, extras };
}

/** llama.cpp exposes a single `default_generation_settings` block via /props. */
async function pullLlamaCpp(m: DiscoveredLocalModel): Promise<PulledDefaults> {
  const base = m.chatBaseUrl.replace(/\/v1\/?$/, '');
  const res = await fetch(`${base}/props`, {
    method: 'GET',
    headers: { accept: 'application/json', ...authHeaders(m.host, m.port) },
  });
  if (!res.ok) {
    return { source: 'llamacpp', ok: false, runConfig: {}, extras: {}, error: `HTTP ${res.status}` };
  }
  const body = (await res.json()) as {
    default_generation_settings?: Record<string, unknown>;
  };
  const def = body.default_generation_settings ?? {};
  const cfg: MutableRunConfig = {};
  const extras: Record<string, string | number> = {};
  if (typeof def.temperature === 'number') cfg.temperature = def.temperature;
  if (typeof def.top_p === 'number') cfg.topP = def.top_p;
  if (typeof def.seed === 'number' && def.seed >= 0) cfg.seed = def.seed;
  if (typeof def.n_predict === 'number' && def.n_predict > 0) cfg.maxTokens = def.n_predict;
  for (const k of ['top_k', 'repeat_penalty', 'tfs_z', 'typical_p', 'min_p', 'mirostat']) {
    const v = def[k];
    if (typeof v === 'number' || typeof v === 'string') extras[k] = v;
  }
  return { source: 'llamacpp', ok: true, runConfig: cfg, extras };
}

/** LM Studio's API exposes metadata but not sampling defaults. */
async function pullLmStudio(m: DiscoveredLocalModel): Promise<PulledDefaults> {
  const base = m.chatBaseUrl.replace(/\/v1\/?$/, '');
  const res = await fetch(`${base}/api/v0/models/${encodeURIComponent(m.id)}`, {
    method: 'GET',
    headers: { accept: 'application/json', ...authHeaders(m.host, m.port) },
  });
  if (!res.ok) {
    return {
      source: 'lmstudio',
      ok: false,
      runConfig: {},
      extras: {},
      error: `HTTP ${res.status}`,
      note: LMSTUDIO_NO_SAMPLING,
    };
  }
  const body = (await res.json()) as {
    max_context_length?: number;
    loaded_context_length?: number;
    quantization?: string;
    arch?: string;
    state?: string;
  };
  const extras: Record<string, string | number> = {};
  if (typeof body.max_context_length === 'number') extras.max_context_length = body.max_context_length;
  if (typeof body.loaded_context_length === 'number')
    extras.loaded_context_length = body.loaded_context_length;
  if (typeof body.quantization === 'string') extras.quantization = body.quantization;
  if (typeof body.arch === 'string') extras.arch = body.arch;
  if (typeof body.state === 'string') extras.state = body.state;
  return {
    source: 'lmstudio',
    ok: true,
    runConfig: {},
    extras,
    note: LMSTUDIO_NO_SAMPLING,
  };
}
