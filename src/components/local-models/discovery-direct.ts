/**
 * Browser-direct localhost discovery.
 *
 * The hosted ALDO API can't reach `127.0.0.1` on the visitor's machine
 * — that's a network reality, not a config issue. So discovery for
 * `/local-models` runs straight from the browser: we GET well-known
 * LLM endpoints with `mode: 'cors'` and let the per-runtime CORS
 * setting decide whether the page sees a model list back.
 *
 * Servers we know how to talk to:
 *   - Ollama   → GET /api/tags        (returns { models: [{ name, … }] })
 *   - LM Studio→ GET /v1/models       (OpenAI-compat — needs LM Studio CORS toggle ON)
 *   - vLLM    → GET /v1/models        (OpenAI-compat — pass --allow-origins)
 *   - llama.cpp→ GET /v1/models        (OpenAI-compat — pass --api-cors '*')
 *
 * `fetch()` rejects with `TypeError` on three indistinguishable cases:
 *   - port closed / nothing listening
 *   - DNS / network failure
 *   - CORS preflight refused (no Access-Control-Allow-Origin header)
 *
 * The browser logs the CORS one to console but JS can't read that. So
 * we treat any thrown `TypeError` as "either nothing's there OR CORS
 * is blocking" and surface the same help panel either way.
 *
 * No server SDK; no API roundtrip. Tested against LM Studio with
 * "Enable CORS" on (localhost:1234) and Ollama with `OLLAMA_ORIGINS=*`
 * (localhost:11434).
 */

import { readApiKey } from './auth-store';

export type DiscoverySource = 'ollama' | 'lmstudio' | 'vllm' | 'llamacpp';

export interface DiscoveredLocalModel {
  readonly id: string;
  readonly source: DiscoverySource;
  readonly host: string;
  readonly port: number;
  /** Endpoint the bench runner POSTs to — already includes `/v1`. */
  readonly chatBaseUrl: string;
  /** Display URL — the human form (no trailing path). */
  readonly displayBaseUrl: string;
  readonly capability: string;
  /** Optional context-window hint when the server reports it. */
  readonly contextTokens?: number;
}

export interface DiscoveryProbeResult {
  readonly source: DiscoverySource;
  readonly host: string;
  readonly port: number;
  readonly ok: boolean;
  readonly models: readonly DiscoveredLocalModel[];
  /** When `ok=false`, why. `'fetch_failed'` covers CORS + closed-port + network. */
  readonly reason?: 'fetch_failed' | 'http_error' | 'unauthorized' | 'parse_error' | 'empty';
  readonly httpStatus?: number;
}

interface ProbeSpec {
  readonly source: DiscoverySource;
  readonly port: number;
  /** Path appended to `http://<host>:<port>` when probing. */
  readonly probePath: string;
  /** Path appended to `http://<host>:<port>` for the chat completions endpoint base. */
  readonly chatPath: string;
  parseModels(body: unknown, host: string, port: number): readonly DiscoveredLocalModel[];
}

const HOST_DEFAULT = '127.0.0.1';
const PROBE_TIMEOUT_MS = 1500;

const PROBES: readonly ProbeSpec[] = [
  {
    source: 'ollama',
    port: 11434,
    probePath: '/api/tags',
    chatPath: '/v1', // ollama exposes openai-compat under /v1/chat/completions
    parseModels(body, host, port) {
      const b = body as { models?: ReadonlyArray<{ name?: string; size?: number }> };
      if (!Array.isArray(b.models)) return [];
      return b.models
        .map((m) => m?.name ?? '')
        .filter((id) => id.length > 0)
        .map((id) =>
          buildModel({ id, source: 'ollama', host, port, capability: 'local-reasoning' }),
        );
    },
  },
  {
    source: 'lmstudio',
    port: 1234,
    probePath: '/v1/models',
    chatPath: '/v1',
    parseModels(body, host, port) {
      const b = body as {
        data?: ReadonlyArray<{
          id?: string;
          loaded_context_length?: number;
          max_context_length?: number;
        }>;
      };
      if (!Array.isArray(b.data)) return [];
      return b.data
        .map((m) => ({
          id: (m?.id ?? '').trim(),
          ctx: m?.loaded_context_length ?? m?.max_context_length,
        }))
        .filter((m) => m.id.length > 0)
        .map((m) =>
          buildModel({
            id: m.id,
            source: 'lmstudio',
            host,
            port,
            capability: 'local-reasoning',
            ...(typeof m.ctx === 'number' ? { contextTokens: m.ctx } : {}),
          }),
        );
    },
  },
  {
    source: 'vllm',
    port: 8000,
    probePath: '/v1/models',
    chatPath: '/v1',
    parseModels(body, host, port) {
      const b = body as { data?: ReadonlyArray<{ id?: string; max_model_len?: number }> };
      if (!Array.isArray(b.data)) return [];
      return b.data
        .map((m) => ({ id: (m?.id ?? '').trim(), ctx: m?.max_model_len }))
        .filter((m) => m.id.length > 0)
        .map((m) =>
          buildModel({
            id: m.id,
            source: 'vllm',
            host,
            port,
            capability: 'local-reasoning',
            ...(typeof m.ctx === 'number' ? { contextTokens: m.ctx } : {}),
          }),
        );
    },
  },
  {
    source: 'llamacpp',
    port: 8080,
    probePath: '/v1/models',
    chatPath: '/v1',
    parseModels(body, host, port) {
      const b = body as { data?: ReadonlyArray<{ id?: string }> };
      if (!Array.isArray(b.data)) return [];
      return b.data
        .map((m) => (m?.id ?? '').trim())
        .filter((id) => id.length > 0)
        .map((id) =>
          buildModel({ id, source: 'llamacpp', host, port, capability: 'local-reasoning' }),
        );
    },
  },
];

function buildModel(opts: {
  id: string;
  source: DiscoverySource;
  host: string;
  port: number;
  capability: string;
  contextTokens?: number;
}): DiscoveredLocalModel {
  const display = `http://${opts.host}:${opts.port}`;
  return {
    id: opts.id,
    source: opts.source,
    host: opts.host,
    port: opts.port,
    chatBaseUrl: `${display}/v1`,
    displayBaseUrl: display,
    capability: opts.capability,
    ...(opts.contextTokens !== undefined ? { contextTokens: opts.contextTokens } : {}),
  };
}

export interface DiscoverDirectOptions {
  readonly host?: string;
  /**
   * Extra hosts to probe in addition to the default localhost. Each
   * entry can be:
   *   - bare host or IP                  e.g. "192.168.1.42"
   *   - host:port                         e.g. "192.168.1.42:11434"
   *   - http(s)://host[:port][/path]      e.g. "https://gpu.lan:8443"
   *
   * For the bare-host form, every well-known port is probed (Ollama
   * 11434 / LM Studio 1234 / vLLM 8000 / llama.cpp 8080). For the
   * pinned-port forms, every probe spec attempts that single port —
   * the one whose response shape parses wins.
   *
   * Heads-up: from an HTTPS page the browser blocks `http://` to
   * non-loopback hosts as mixed content (Private Network Access also
   * applies on Chrome). Loopback / `https://` / and the user's own
   * insecure page all work. UI surface explains this.
   */
  readonly extraHosts?: readonly string[];
  readonly timeoutMs?: number;
  /** Override `globalThis.fetch` for tests. */
  readonly fetchImpl?: typeof fetch;
}

export interface DiscoverDirectResult {
  readonly probedAt: string;
  readonly host: string;
  readonly probes: readonly DiscoveryProbeResult[];
  /** Flat list of every model from every successful probe. */
  readonly models: readonly DiscoveredLocalModel[];
  /** True when every probe failed AND none returned an HTTP body. Treat
   *  as "either nothing's running OR CORS is blocking — show help". */
  readonly likelyBlocked: boolean;
}

interface ParsedHost {
  /** What the user typed, normalised for display + dedupe. */
  readonly raw: string;
  /** Scheme actually probed — http or https. */
  readonly scheme: 'http' | 'https';
  /** Hostname or IP literal, no scheme/port. */
  readonly host: string;
  /** When `null`, probe every well-known port. When set, probe only this. */
  readonly port: number | null;
}

/**
 * Parse a user-entered host string. Returns null when the input is
 * unusable (empty, malformed). Lenient — no requirement for a scheme.
 */
export function parseHostSpec(input: string): ParsedHost | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) return null;

  // URL-shaped input: parse via URL so IPv6 in brackets etc. just work.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hostname.length === 0) return null;
      return {
        raw: trimmed,
        scheme: u.protocol === 'https:' ? 'https' : 'http',
        host: u.hostname,
        port: u.port.length > 0 ? Number(u.port) : null,
      };
    } catch {
      return null;
    }
  }

  // host:port — only take the *last* colon to allow bracketed IPv6.
  const m = trimmed.match(/^(.+?)(?::(\d{1,5}))?$/);
  if (m === null) return null;
  const host = (m[1] ?? '').replace(/^\[(.*)\]$/, '$1');
  const portStr = m[2];
  if (host.length === 0) return null;
  const port = portStr !== undefined ? Number(portStr) : null;
  if (port !== null && (!Number.isFinite(port) || port < 1 || port > 65535)) return null;
  return { raw: trimmed, scheme: 'http', host, port };
}

/** Build the probe URL the runner will hit. */
function probeUrlFor(
  spec: ProbeSpec,
  parsed: ParsedHost,
): {
  fetchUrl: string;
  displayBaseUrl: string;
  chatBaseUrl: string;
  port: number;
} {
  const port = parsed.port ?? spec.port;
  const display = `${parsed.scheme}://${parsed.host}:${port}`;
  return {
    fetchUrl: `${display}${spec.probePath}`,
    displayBaseUrl: display,
    chatBaseUrl: `${display}${spec.chatPath}`,
    port,
  };
}

async function probeOneFromSpec(
  spec: ProbeSpec,
  parsed: ParsedHost,
  signal: AbortSignal,
): Promise<DiscoveryProbeResult> {
  const { fetchUrl, displayBaseUrl, chatBaseUrl, port } = probeUrlFor(spec, parsed);
  // Inject Authorization when the user has a stored key for this
  // host:port — covers LM Studio's API-key mode, vLLM `--api-key`,
  // llama.cpp `--api-key`, and any reverse proxy fronting the engine.
  const apiKey = readApiKey(parsed.host, port);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey !== null) headers.authorization = `Bearer ${apiKey}`;
  let res: Response;
  try {
    res = await fetch(fetchUrl, {
      method: 'GET',
      headers,
      mode: 'cors',
      signal,
    });
  } catch {
    return {
      source: spec.source,
      host: parsed.host,
      port,
      ok: false,
      models: [],
      reason: 'fetch_failed',
    };
  }
  if (!res.ok) {
    // 401/403 = engine is reachable but rejected our credentials
    // (or absence of them). Distinct reason so the panel can surface
    // a "needs API key" hint instead of a generic "http error".
    const reason: DiscoveryProbeResult['reason'] =
      res.status === 401 || res.status === 403 ? 'unauthorized' : 'http_error';
    return {
      source: spec.source,
      host: parsed.host,
      port,
      ok: false,
      models: [],
      reason,
      httpStatus: res.status,
    };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      source: spec.source,
      host: parsed.host,
      port,
      ok: false,
      models: [],
      reason: 'parse_error',
    };
  }
  // Re-shape the model entries with the actual scheme/port the probe
  // hit, so the bench runner reaches the same endpoint that responded.
  const baseModels = spec.parseModels(body, parsed.host, port);
  const models = baseModels.map((m) => ({
    ...m,
    chatBaseUrl,
    displayBaseUrl,
  }));
  if (models.length === 0) {
    return { source: spec.source, host: parsed.host, port, ok: false, models: [], reason: 'empty' };
  }
  return { source: spec.source, host: parsed.host, port, ok: true, models };
}

/** Probe every well-known LLM port from the browser, in parallel. */
export async function discoverDirect(
  opts: DiscoverDirectOptions = {},
): Promise<DiscoverDirectResult> {
  const host = opts.host ?? HOST_DEFAULT;
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;

  // Restore fetch override after the run for test cleanliness.
  const saved = opts.fetchImpl !== undefined ? globalThis.fetch : null;
  if (opts.fetchImpl !== undefined) globalThis.fetch = opts.fetchImpl;

  // Build the full target list: localhost + every parsed extra host.
  // Dedupe by raw text so re-running with the same chips doesn't fan
  // out the probe count.
  const targets: ParsedHost[] = [{ raw: host, scheme: 'http', host, port: null }];
  const seen = new Set<string>([targets[0]?.raw ?? host]);
  for (const entry of opts.extraHosts ?? []) {
    const parsed = parseHostSpec(entry);
    if (parsed === null) continue;
    if (seen.has(parsed.raw)) continue;
    seen.add(parsed.raw);
    targets.push(parsed);
  }

  // For each target, fan out every probe spec — except when the user
  // pinned a single port, in which case only run that one against
  // every shape (the one whose body parses wins).
  const probeJobs: Array<{ spec: ProbeSpec; target: ParsedHost }> = [];
  for (const target of targets) {
    if (target.port === null) {
      for (const spec of PROBES) probeJobs.push({ spec, target });
    } else {
      for (const spec of PROBES) probeJobs.push({ spec, target });
    }
  }

  const results = await Promise.all(
    probeJobs.map(async ({ spec, target }) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        return await probeOneFromSpec(spec, target, ac.signal);
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  if (saved !== null) globalThis.fetch = saved;

  const flat = results.flatMap((r) => r.models);
  const likelyBlocked = flat.length === 0 && results.every((r) => r.reason === 'fetch_failed');

  return {
    probedAt: new Date().toISOString(),
    host,
    probes: results,
    models: flat,
    likelyBlocked,
  };
}
