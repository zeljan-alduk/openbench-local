/**
 * Engine-truth model metadata (capabilities, quantization, arch).
 *
 * Discovery only sees model ids; whether a model actually supports
 * vision or native tool calls lives behind engine-specific endpoints:
 *
 *   - Ollama    → POST /api/show {name}   → `capabilities` array
 *                 (completion|vision|tools|thinking|embedding|insert)
 *                 + details.{quantization_level,family,parameter_size}
 *   - LM Studio → GET /api/v0/models/{id} → `capabilities` array
 *                 (≥0.3.x) + `type` ('llm'|'vlm'|'embeddings')
 *                 + quantization/arch
 *   - llama.cpp → GET /props              → modalities.vision only
 *   - vLLM     → nothing exposed over HTTP → heuristics only
 *
 * This runs post-scan for every discovered model (best-effort,
 * timeout-capped, never throws) and the result is merged over the
 * name heuristics by `resolveCapabilities` in capabilities.ts —
 * engine truth wins per field when present. This module is separate
 * from engine-defaults.ts on purpose: that one is the gear-modal
 * "pull sampling defaults" flow with a different lifecycle.
 */

import { readApiKey } from './auth-store';
import type { EngineCapabilityFlags, ModelEngineMeta } from './capabilities';
import type { DiscoveredLocalModel } from './discovery-direct';

const META_TIMEOUT_MS = 2500;

function authHeaders(host: string, port: number): Record<string, string> {
  const key = readApiKey(host, port);
  return key !== null ? { authorization: `Bearer ${key}` } : {};
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, mode: 'cors', signal: ac.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ollamaMeta(body: unknown): ModelEngineMeta | null {
  const b = body as {
    capabilities?: unknown;
    details?: { family?: unknown; parameter_size?: unknown; quantization_level?: unknown };
  } | null;
  if (b === null || typeof b !== 'object') return null;
  let capabilities: EngineCapabilityFlags | undefined;
  if (Array.isArray(b.capabilities)) {
    const caps = b.capabilities.filter((c): c is string => typeof c === 'string');
    // Ollama's array is authoritative: it covers all four flags.
    capabilities = {
      vision: caps.includes('vision'),
      toolUse: caps.includes('tools'),
      reasoning: caps.includes('thinking'),
      embedding: caps.includes('embedding'),
    };
  }
  const d = b.details;
  const meta: ModelEngineMeta = {
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(typeof d?.quantization_level === 'string' ? { quantization: d.quantization_level } : {}),
    ...(typeof d?.family === 'string' ? { family: d.family } : {}),
    ...(typeof d?.parameter_size === 'string' ? { parameterSize: d.parameter_size } : {}),
  };
  return Object.keys(meta).length > 0 ? meta : null;
}

function lmStudioMeta(body: unknown): ModelEngineMeta | null {
  const b = body as {
    type?: unknown;
    arch?: unknown;
    quantization?: unknown;
    capabilities?: unknown;
  } | null;
  if (b === null || typeof b !== 'object') return null;
  const flags: {
    vision?: boolean;
    toolUse?: boolean;
    reasoning?: boolean;
    embedding?: boolean;
  } = {};
  if (Array.isArray(b.capabilities)) {
    const caps = b.capabilities.filter((c): c is string => typeof c === 'string');
    flags.toolUse = caps.includes('tool_use');
    flags.vision = caps.includes('vision');
    // LM Studio doesn't report reasoning — leave absent for heuristic fallback.
  }
  if (b.type === 'vlm') flags.vision = true;
  if (b.type === 'embeddings') flags.embedding = true;
  else if (b.type === 'llm') flags.embedding = false;
  const capabilities = Object.keys(flags).length > 0 ? (flags as EngineCapabilityFlags) : undefined;
  const meta: ModelEngineMeta = {
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(typeof b.quantization === 'string' ? { quantization: b.quantization } : {}),
    ...(typeof b.arch === 'string' ? { arch: b.arch } : {}),
  };
  return Object.keys(meta).length > 0 ? meta : null;
}

function llamaCppMeta(body: unknown): ModelEngineMeta | null {
  const b = body as { modalities?: { vision?: unknown } } | null;
  if (b === null || typeof b !== 'object') return null;
  const vision = b.modalities?.vision;
  if (typeof vision !== 'boolean') return null;
  // llama.cpp reports ONLY vision; other flags stay absent so their
  // provenance remains 'inferred'.
  return { capabilities: { vision } };
}

/** Engine-truth metadata for one model. Never throws — returns null on any failure. */
export async function fetchEngineMeta(
  model: DiscoveredLocalModel,
  opts?: { readonly timeoutMs?: number },
): Promise<ModelEngineMeta | null> {
  const timeoutMs = opts?.timeoutMs ?? META_TIMEOUT_MS;
  const headers = authHeaders(model.host, model.port);
  switch (model.source) {
    case 'ollama': {
      const base = model.chatBaseUrl.replace(/\/v1\/?$/, '');
      const body = await fetchJson(
        `${base}/api/show`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ name: model.id }),
        },
        timeoutMs,
      );
      return body === null ? null : ollamaMeta(body);
    }
    case 'lmstudio': {
      const base = model.chatBaseUrl.replace(/\/v1\/?$/, '');
      // LM Studio ids are often slash-namespaced ('qwen/qwen2.5-vl-7b');
      // encode each path segment separately so the '/' survives —
      // a %2F-encoded slash 404s on LM Studio's router.
      const idPath = model.id.split('/').map(encodeURIComponent).join('/');
      const body = await fetchJson(
        `${base}/api/v0/models/${idPath}`,
        { headers },
        timeoutMs,
      );
      return body === null ? null : lmStudioMeta(body);
    }
    case 'llamacpp': {
      const base = model.chatBaseUrl.replace(/\/v1\/?$/, '');
      const body = await fetchJson(`${base}/props`, { headers }, timeoutMs);
      return body === null ? null : llamaCppMeta(body);
    }
    case 'vllm':
      return null;
    default: {
      const _exhaust: never = model.source;
      void _exhaust;
      return null;
    }
  }
}

/**
 * Best-effort parallel enrichment; models whose fetch fails (or whose
 * engine exposes nothing) pass through unchanged. All targets are
 * local, so no concurrency cap.
 */
export async function enrichModelsWithEngineMeta(
  models: readonly DiscoveredLocalModel[],
  opts?: { readonly timeoutMs?: number },
): Promise<readonly DiscoveredLocalModel[]> {
  return Promise.all(
    models.map(async (m) => {
      const meta = await fetchEngineMeta(m, opts);
      return meta === null ? m : { ...m, meta };
    }),
  );
}
