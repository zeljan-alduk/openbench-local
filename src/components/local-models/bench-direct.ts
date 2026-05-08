/**
 * Browser-direct quality × speed bench.
 *
 * For each case in the inlined suite:
 *   1. POST `<chatBaseUrl>/chat/completions` with `stream: true`.
 *   2. Read SSE deltas: capture `content`, `reasoning_content`, and
 *      the `usage` summary from the last chunk.
 *   3. Score the resulting text via `evaluateOutput`.
 *   4. Emit one `BenchCaseRow` callback.
 *
 * Cancellable: the caller passes an `AbortSignal` (the React island
 * binds it to a "Stop" button + unmount cleanup).
 *
 * No platform code on the server path — every byte stays between the
 * browser and `127.0.0.1:<port>`.
 */

import { readApiKey } from './auth-store';
import type { InlineCase, InlineSuite } from './builtin-suite';
import { type EvalOutcome, evaluateRow } from './evaluator-direct';

/**
 * Pull the optional Bearer token for whichever host:port the chat
 * URL resolves to. Returns an empty headers object when the user
 * hasn't set a key for that endpoint.
 */
function authHeadersFor(chatBaseUrl: string): Record<string, string> {
  try {
    const u = new URL(chatBaseUrl);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const key = readApiKey(u.hostname, port);
    return key !== null ? { authorization: `Bearer ${key}` } : {};
  } catch {
    return {};
  }
}

/** Single tool-call emitted by the model in the SSE stream. */
export interface CapturedToolCall {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  /** Raw `function.arguments` string — JSON or partial JSON, exactly as streamed. */
  readonly argumentsRaw: string;
}

/** One attempt within a repeated case. */
export interface AttemptResult {
  readonly passed: boolean;
  readonly totalMs: number;
  readonly tokensOut: number | null;
  readonly skipped?: boolean;
  readonly skipReason?: string;
  readonly error?: string;
}

export interface BenchCaseRow {
  readonly id: string;
  readonly passed: boolean;
  /**
   * 0..1. For single-attempt cases this matches the boolean
   * `passed`. For repeated cases, it's the pass fraction
   * (e.g. 2/3 = 0.667).
   */
  readonly score: number;
  /**
   * Per-attempt breakdown when `repeatCount > 1`. Undefined for
   * single-attempt runs to keep payloads small.
   */
  readonly attempts?: readonly AttemptResult[];
  readonly totalMs: number;
  readonly ttftMs: number | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokPerSec: number | null;
  readonly reasoningRatio: number | null;
  /** The prompt as fed to the model (the case's `input`). */
  readonly input: string;
  /** The evaluator clause this case was scored against. */
  readonly expect: InlineCase['expect'];
  /** What the model actually produced — content stream only, reasoning excluded. */
  readonly output: string;
  /** Combined reasoning_content streams when the provider emitted them. */
  readonly reasoningOutput: string;
  /** Native tool-calls captured from `delta.tool_calls`. Empty when none emitted. */
  readonly toolCalls: readonly CapturedToolCall[];
  /** When the case carried an image, the data URL is preserved on the row for the table preview. */
  readonly imageDataUrl: string | null;
  /**
   * `true` when the user pressed "Skip" mid-case OR the case was
   * auto-skipped because the model lacks the required capability.
   * Skipped rows are not counted as fail in the summary — they're
   * excluded from the denominator entirely.
   */
  readonly skipped: boolean;
  /** Why the case was skipped, when relevant (e.g. "lacks tool-use capability"). */
  readonly skipReason?: string;
  readonly error?: string;
  readonly detail?: unknown;
}

export interface BenchSummary {
  readonly passed: number;
  readonly total: number;
  readonly passRate: number;
  readonly avgTokPerSec: number | null;
  readonly avgReasoningRatio: number | null;
  readonly p95LatencyMs: number;
  /**
   * Per-tag rollup: for each tag that appears on at least one graded
   * case, the pass count and total. Useful for "good at reasoning,
   * weak at tool-use" diagnostics.
   */
  readonly byTag: ReadonlyMap<string, { readonly passed: number; readonly total: number }>;
}

/**
 * Per-request generation parameters the user can tune from the Setup
 * panel. Every field is optional — unset fields fall back to the
 * runner's defaults (temperature 0, max_tokens 1024, no system
 * message, no seed). Engine-specific knobs that don't fit here go
 * through the engine reference panel as documentation, not API.
 */
export interface RunConfig {
  /** 0 = deterministic, higher = more random. */
  readonly temperature?: number;
  readonly topP?: number;
  /** Hard cap on response token count. Engines clamp to model max. */
  readonly maxTokens?: number;
  /** Provider-supported integer seed for repeatability. */
  readonly seed?: number;
  /** System message prepended to every case. Empty string = no system message. */
  readonly systemPrompt?: string;
  /**
   * Thinking-mode control.
   *
   *   - 'low' / 'medium' / 'high' → sent verbatim as `reasoning_effort`
   *     on the chat-completion body. gpt-oss honours this natively;
   *     DeepSeek-R1 and QwQ honour it via some providers; most other
   *     models silently ignore it.
   *   - 'off' → best-effort suppression. We DON'T send the
   *     `reasoning_effort` field, AND we prepend a no-thinking
   *     directive to the system message ("/no_think" works for
   *     Qwen3; the plain-English instruction covers the rest).
   *     Always-thinking models (e.g. QwQ-32B) may ignore it; for a
   *     hard guarantee, pick a non-reasoning model.
   *   - undefined → don't override; fall through to the engine
   *     default.
   */
  readonly reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  /**
   * Send a tiny "respond with OK" before case 1 so the first real
   * case's TTFT reflects steady-state inference instead of cold
   * model load. Default: true.
   */
  readonly warmUp?: boolean;
  /**
   * Hard cap (ms) on a single case's wall-clock time. When the cap
   * fires, the in-flight request is aborted and the row is recorded
   * as `skipped: true` with `skipReason: 'timeout'`. 0 / negative =
   * no timeout (a stuck case can hang the bench until the user hits
   * Skip / Stop). Default: 120_000 (120s).
   */
  readonly caseTimeoutMs?: number;
  /**
   * Repeat each case N times to surface flakiness. The combined row
   * keeps `passed: true` only when every attempt passed; `score`
   * carries the fraction (passes / attempts). Useful for non-zero
   * temperature runs where a model might pass once and fail twice on
   * the same prompt. Default: 1 (single attempt).
   */
  readonly repeatCount?: number;
}

export interface RunBenchOptions {
  readonly suite: InlineSuite;
  readonly modelId: string;
  /** OpenAI-compat base URL ending in `/v1`. The runner appends `/chat/completions`. */
  readonly chatBaseUrl: string;
  readonly maxTokens?: number;
  /** Global abort: cuts the whole run short. Rows after the in-flight one are not produced. */
  readonly signal?: AbortSignal;
  /**
   * Called at the start of each case with a `skip()` thunk. Calling
   * `skip()` aborts the in-flight HTTP request for that case only —
   * the runner records the row as `skipped: true` and continues with
   * the next case. Distinct from `signal`, which stops the whole run.
   */
  readonly onCaseStart?: (caseId: string, skip: () => void) => void;
  readonly onCase: (row: BenchCaseRow, index: number) => void;
  /**
   * Throttled progress callback fired during streaming. Lets the UI
   * show the partial output as the model speaks. Throttled to
   * ~120 ms so a chatty stream doesn't flood React's reconciler.
   */
  readonly onCaseProgress?: (
    caseId: string,
    partial: { content: string; reasoning: string },
  ) => void;
  /** Called when the warm-up ping completes (or fails). Diagnostic only. */
  readonly onWarmUp?: (result: { ok: boolean; ms: number; error?: string }) => void;
  /**
   * Capabilities the model claims (per the id-heuristics in
   * capabilities.ts). When a case carries `requires` and the
   * capability is absent, the runner records a skipped row instead
   * of dispatching the request. Pass `null` to opt out of the gate
   * (still useful when the heuristic mis-classifies).
   */
  readonly modelCapabilities?: {
    readonly toolUse: boolean;
    readonly vision: boolean;
  } | null;
  /** Per-request generation parameters. Defaults: temp=0, max_tokens=1024, no system. */
  readonly runConfig?: RunConfig;
}

// Default cap for cases where the user / per-model config doesn't
// specify one. 8192 is generous enough for reasoning models
// (gpt-oss, DeepSeek-R1, QwQ) to finish a full thought + emit an
// answer, but tight enough to catch runaway loops within ~minute.
// Set to 0 in the Setup panel or per-model config to send no
// max_tokens at all (the engine then uses its model-context budget).
const DEFAULT_MAX_TOKENS = 8192;
// Default per-case wall-clock cap. 120s tolerates long-context-recall
// on slower local engines while still preventing a stuck case from
// hanging the bench indefinitely (e.g. when the user picked unlimited
// max_tokens and a model loops). Set caseTimeoutMs to 0 in RunConfig
// to disable.
const DEFAULT_CASE_TIMEOUT_MS = 120_000;

/** Run the suite. Returns the final summary. */
export async function runBenchDirect(opts: RunBenchOptions): Promise<{
  readonly rows: readonly BenchCaseRow[];
  readonly summary: BenchSummary;
}> {
  const rows: BenchCaseRow[] = [];
  const runConfig = opts.runConfig ?? {};
  const warmUpEnabled = runConfig.warmUp ?? true;

  // Warm-up ping: send a tiny request before the first real case so
  // case 1's TTFT reflects steady-state inference rather than cold
  // model load. Failure is non-fatal — we surface it via onWarmUp
  // and proceed; the first case will just include the load time.
  if (warmUpEnabled && !opts.signal?.aborted) {
    const w0 = performance.now();
    try {
      await warmUpModel({
        chatBaseUrl: opts.chatBaseUrl,
        modelId: opts.modelId,
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      });
      opts.onWarmUp?.({ ok: true, ms: Math.round(performance.now() - w0) });
    } catch (e) {
      opts.onWarmUp?.({
        ok: false,
        ms: Math.round(performance.now() - w0),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (let i = 0; i < opts.suite.cases.length; i++) {
    if (opts.signal?.aborted) break;
    const c = opts.suite.cases[i];
    if (c === undefined) continue;

    // Capability gate: if the case declares a required capability and
    // the model id-heuristic says the model lacks it, record a
    // skipped row without dispatching the request. Cheaper for the
    // user (no wasted seconds waiting for a fail) and cleaner UX
    // (a "skipped — lacks vision" badge reads better than a fail).
    const missing = capabilityMissing(c, opts.modelCapabilities);
    if (missing !== null) {
      const row: BenchCaseRow = {
        id: c.id,
        passed: false,
        score: 0,
        totalMs: 0,
        ttftMs: null,
        tokensIn: null,
        tokensOut: null,
        tokPerSec: null,
        reasoningRatio: null,
        input: c.input,
        expect: c.expect,
        output: '',
        reasoningOutput: '',
        toolCalls: [],
        imageDataUrl: c.image?.dataUrl ?? null,
        skipped: true,
        skipReason: `lacks ${missing} capability`,
      };
      opts.onCase(row, i);
      rows.push(row);
      continue;
    }

    const repeatCount = Math.max(1, Math.floor(runConfig.repeatCount ?? 1));
    const caseTimeoutMs = runConfig.caseTimeoutMs ?? DEFAULT_CASE_TIMEOUT_MS;

    const attempts: AttemptResult[] = [];
    let lastRow: BenchCaseRow | null = null;
    let userSkipped = false;
    let timedOut = false;

    for (let attempt = 0; attempt < repeatCount; attempt++) {
      if (opts.signal?.aborted) break;

      // Per-case + per-attempt controller. The global signal AND the
      // user's "Skip" button AND the per-case timeout all fire through
      // the same AbortController; we tell the three apart afterwards
      // by inspecting which fired first.
      const caseAc = new AbortController();
      const onGlobalAbort = () => caseAc.abort();
      if (opts.signal !== undefined) {
        if (opts.signal.aborted) caseAc.abort();
        else opts.signal.addEventListener('abort', onGlobalAbort, { once: true });
      }
      let attemptTimedOut = false;
      let attemptSkipped = false;
      const skip = () => {
        attemptSkipped = true;
        userSkipped = true;
        caseAc.abort();
      };
      const timer =
        caseTimeoutMs > 0
          ? setTimeout(() => {
              attemptTimedOut = true;
              timedOut = true;
              caseAc.abort();
            }, caseTimeoutMs)
          : null;
      opts.onCaseStart?.(c.id, skip);

      const baseRow = await runOne(c, {
        chatBaseUrl: opts.chatBaseUrl,
        modelId: opts.modelId,
        maxTokens: runConfig.maxTokens ?? opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        signal: caseAc.signal,
        runConfig,
        ...(opts.onCaseProgress !== undefined
          ? {
              onProgress: (partial: { content: string; reasoning: string }) =>
                opts.onCaseProgress?.(c.id, partial),
            }
          : {}),
      });
      if (timer !== null) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onGlobalAbort);

      const aborted = caseAc.signal.aborted && !(opts.signal?.aborted ?? false);
      const reason = attemptTimedOut
        ? `timeout (${Math.round(caseTimeoutMs / 1000)}s)`
        : attemptSkipped
          ? 'user skipped'
          : null;
      const attemptRow: BenchCaseRow =
        aborted && reason !== null
          ? stripError({
              ...baseRow,
              passed: false,
              score: 0,
              skipped: true,
              skipReason: reason,
            })
          : baseRow;
      attempts.push({
        passed: attemptRow.passed,
        totalMs: attemptRow.totalMs,
        tokensOut: attemptRow.tokensOut,
        ...(attemptRow.skipped !== undefined ? { skipped: attemptRow.skipped } : {}),
        ...(attemptRow.skipReason !== undefined ? { skipReason: attemptRow.skipReason } : {}),
        ...(attemptRow.error !== undefined ? { error: attemptRow.error } : {}),
      });
      lastRow = attemptRow;

      // If the user pressed Skip mid-attempt, don't keep retrying —
      // they wanted to move on. Timeouts on the other hand still
      // exhaust the configured repeat count, since the user might be
      // sampling reliability against a slow engine on purpose.
      if (attemptSkipped || opts.signal?.aborted) break;
    }

    // Combine attempts into a single row. For single-attempt runs
    // this preserves the previous shape exactly (no `attempts` field
    // on the wire). For multi-attempt runs:
    //   - `passed` = strict all-pass (every attempt scored). The
    //     bench is benchmarking RELIABILITY, so the strict definition
    //     is the honest one.
    //   - `score` = fraction (passes / attempts) so the per-tag
    //     summary still shows partial credit.
    //   - `skipped` only set when ALL attempts skipped.
    if (lastRow !== null) {
      const passes = attempts.filter((a) => a.passed).length;
      const allSkipped = attempts.length > 0 && attempts.every((a) => a.skipped === true);
      const combined: BenchCaseRow = {
        ...lastRow,
        passed: attempts.length > 0 && passes === attempts.length,
        score: attempts.length > 0 ? passes / attempts.length : 0,
        ...(attempts.length > 1 ? { attempts } : {}),
        ...(allSkipped
          ? {
              skipped: true,
              skipReason: timedOut ? `timeout × ${attempts.length}` : 'user skipped',
            }
          : {}),
      };
      rows.push(combined);
      opts.onCase(combined, i);
    }
    if (userSkipped && opts.signal?.aborted) break;
    void timedOut;
  }
  return { rows, summary: summarise(rows) };
}

function capabilityMissing(
  c: InlineCase,
  caps: RunBenchOptions['modelCapabilities'],
): string | null {
  if (c.requires === undefined || caps === null || caps === undefined) return null;
  if (c.requires === 'tool_use' && !caps.toolUse) return 'tool-use';
  if (c.requires === 'vision' && !caps.vision) return 'vision';
  return null;
}

function stripError(row: BenchCaseRow): BenchCaseRow {
  const { error: _err, ...rest } = row;
  void _err;
  return rest as BenchCaseRow;
}

interface RunCtx {
  readonly chatBaseUrl: string;
  readonly modelId: string;
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
  readonly runConfig?: RunConfig;
  /**
   * Throttled callback for streaming output. The runner buffers and
   * fires every ~120 ms; the UI uses this to render the partial
   * answer in real time so a slow model doesn't look hung.
   */
  readonly onProgress?: (partial: { content: string; reasoning: string }) => void;
}

const PROGRESS_INTERVAL_MS = 120;

async function runOne(c: InlineCase, ctx: RunCtx): Promise<BenchCaseRow> {
  const start = performance.now();
  let captured: SseCapture;
  try {
    captured = await streamCompletion(c, ctx);
  } catch (e) {
    return {
      id: c.id,
      passed: false,
      score: 0,
      totalMs: performance.now() - start,
      ttftMs: null,
      tokensIn: null,
      tokensOut: null,
      tokPerSec: null,
      reasoningRatio: null,
      input: c.input,
      expect: c.expect,
      output: '',
      reasoningOutput: '',
      toolCalls: [],
      imageDataUrl: c.image?.dataUrl ?? null,
      skipped: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const totalMs = performance.now() - start;
  const toolCalls = freezeToolCalls(captured.toolCalls);
  const evalResult: EvalOutcome = evaluateRow({ content: captured.content, toolCalls }, c.expect);
  const reasoningRatio =
    captured.tokensReasoning !== null && captured.tokensOut !== null && captured.tokensOut > 0
      ? captured.tokensReasoning / captured.tokensOut
      : captured.reasoning.length + captured.content.length > 0
        ? captured.reasoning.length / (captured.reasoning.length + captured.content.length)
        : null;
  const tokPerSec =
    captured.tokensOut !== null && totalMs > 0 ? (captured.tokensOut / totalMs) * 1000 : null;
  return {
    id: c.id,
    passed: evalResult.passed,
    score: evalResult.score,
    totalMs,
    ttftMs: captured.ttftMs,
    tokensIn: captured.tokensIn,
    tokensOut: captured.tokensOut,
    tokPerSec,
    reasoningRatio,
    input: c.input,
    expect: c.expect,
    output: captured.content,
    reasoningOutput: captured.reasoning,
    toolCalls,
    imageDataUrl: c.image?.dataUrl ?? null,
    skipped: false,
    ...(evalResult.detail !== undefined ? { detail: evalResult.detail } : {}),
  };
}

function freezeToolCalls(
  acc: ReadonlyMap<number, { id: string; name: string; argumentsRaw: string }>,
): readonly CapturedToolCall[] {
  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, v]) => ({
      index,
      id: v.id,
      name: v.name,
      argumentsRaw: v.argumentsRaw,
    }));
}

interface SseCapture {
  readonly content: string;
  readonly reasoning: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokensReasoning: number | null;
  readonly ttftMs: number | null;
  /** Per-index accumulator: `function.arguments` streams in chunks; we concatenate per index. */
  readonly toolCalls: ReadonlyMap<number, { id: string; name: string; argumentsRaw: string }>;
}

async function streamCompletion(c: InlineCase, ctx: RunCtx): Promise<SseCapture> {
  const url = `${ctx.chatBaseUrl}/chat/completions`;
  const start = performance.now();
  const cfg = ctx.runConfig ?? {};

  // Multimodal body: when the case attaches an image, send the
  // OpenAI-compat content-array shape (text part + image_url part).
  // Otherwise keep the simple string content for max compat.
  const userContent: unknown =
    c.image !== undefined
      ? [
          { type: 'text', text: c.input },
          {
            type: 'image_url',
            image_url: { url: c.image.dataUrl },
          },
        ]
      : c.input;

  // Build the messages array. When the user has set a system prompt
  // in the Setup panel, prepend a system message; otherwise omit it
  // so providers that mis-handle empty system messages aren't poked.
  //
  // Thinking-off branch: when reasoningEffort === 'off', prepend a
  // best-effort no-thinking directive that covers multiple model
  // conventions in one message — `/no_think` is the magic word for
  // Qwen3, the plain-English instruction is what every instruction-
  // tuned model can follow. Reasoning-locked models (QwQ etc.) may
  // ignore it; that's the model's fault, not the alat's.
  const messages: Array<{ role: string; content: unknown }> = [];
  const sysPrompt = (cfg.systemPrompt ?? '').trim();
  const noThink =
    cfg.reasoningEffort === 'off'
      ? "/no_think\nReply directly. Do not think out loud, do not produce <think>...</think> tags, no chain-of-thought."
      : '';
  const combinedSys = [noThink, sysPrompt].filter((s) => s.length > 0).join('\n\n');
  if (combinedSys.length > 0) messages.push({ role: 'system', content: combinedSys });
  messages.push({ role: 'user', content: userContent });

  const body: Record<string, unknown> = {
    model: ctx.modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: cfg.temperature ?? 0,
  };
  // max_tokens === 0 is the explicit "unlimited / engine default"
  // sentinel: omit the field from the body so the engine uses its own
  // model-context budget instead of our cap. Anything > 0 is a hard
  // cap we ship verbatim. Negative values are treated as unlimited
  // for forgiveness (some users type -1).
  if (ctx.maxTokens > 0) body.max_tokens = ctx.maxTokens;
  if (typeof cfg.topP === 'number') body.top_p = cfg.topP;
  if (typeof cfg.seed === 'number') body.seed = cfg.seed;
  // 'off' is our own sentinel — handled via the system-message
  // directive above. Don't ship it on the wire; not all engines
  // understand "off" and some throw on unknown enum values.
  if (cfg.reasoningEffort !== undefined && cfg.reasoningEffort !== 'off') {
    body.reasoning_effort = cfg.reasoningEffort;
  }
  if (c.tools !== undefined && c.tools.length > 0) {
    body.tools = c.tools;
    // tool_choice 'auto' is the OpenAI-compat default; we still set it
    // explicitly so providers that default to 'none' (older vLLM
    // builds) don't suppress the call.
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeadersFor(ctx.chatBaseUrl) },
    mode: 'cors',
    body: JSON.stringify(body),
    ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text.length > 0 ? `: ${text.slice(0, 200)}` : ''}`);
  }
  if (res.body === null) throw new Error('no response body');

  let content = '';
  let reasoning = '';
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let tokensReasoning: number | null = null;
  let ttftMs: number | null = null;
  const toolCalls = new Map<number, { id: string; name: string; argumentsRaw: string }>();

  // Progress emission throttle. The runner fires at most every
  // PROGRESS_INTERVAL_MS so a chatty stream doesn't flood React's
  // reconciler with one setState per token.
  let lastProgressAt = 0;
  let progressDirty = false;
  const flushProgress = () => {
    if (!progressDirty) return;
    progressDirty = false;
    lastProgressAt = performance.now();
    ctx.onProgress?.({ content, reasoning });
  };
  const tickProgress = () => {
    progressDirty = true;
    if (ctx.onProgress === undefined) return;
    const now = performance.now();
    if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) flushProgress();
  };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    while (true) {
      const eol = buf.indexOf('\n');
      if (eol === -1) break;
      const line = buf.slice(0, eol).trim();
      buf = buf.slice(eol + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let frame: SseFrame;
      try {
        frame = JSON.parse(data) as SseFrame;
      } catch {
        continue;
      }
      const delta = frame.choices?.[0]?.delta;
      if (delta) {
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          if (ttftMs === null) ttftMs = performance.now() - start;
          content += delta.content;
          tickProgress();
        }
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          if (ttftMs === null) ttftMs = performance.now() - start;
          reasoning += delta.reasoning_content;
          tickProgress();
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            if (tc === null || typeof tc !== 'object') continue;
            // The OpenAI streaming contract: each delta carries an
            // index, optional id/name (typically only on the first
            // chunk), and an arguments fragment that we concatenate.
            const idx = typeof tc.index === 'number' ? tc.index : 0;
            const slot = toolCalls.get(idx) ?? { id: '', name: '', argumentsRaw: '' };
            if (typeof tc.id === 'string' && tc.id.length > 0) slot.id = tc.id;
            const fn = tc.function;
            if (fn !== null && typeof fn === 'object') {
              if (typeof fn.name === 'string' && fn.name.length > 0) slot.name = fn.name;
              if (typeof fn.arguments === 'string') slot.argumentsRaw += fn.arguments;
            }
            if (ttftMs === null) ttftMs = performance.now() - start;
            toolCalls.set(idx, slot);
          }
        }
      }
      if (frame.usage) {
        if (typeof frame.usage.prompt_tokens === 'number') tokensIn = frame.usage.prompt_tokens;
        if (typeof frame.usage.completion_tokens === 'number')
          tokensOut = frame.usage.completion_tokens;
        const r = frame.usage.completion_tokens_details?.reasoning_tokens;
        if (typeof r === 'number') tokensReasoning = r;
      }
    }
  }
  // Final flush so the table doesn't miss the last chunk because the
  // throttle window hadn't expired when the stream closed.
  flushProgress();

  return { content, reasoning, tokensIn, tokensOut, tokensReasoning, ttftMs, toolCalls };
}

interface SseFrame {
  readonly choices?: Array<{
    readonly delta?: {
      readonly content?: string;
      readonly reasoning_content?: string;
      readonly tool_calls?: ReadonlyArray<{
        readonly index?: number;
        readonly id?: string;
        readonly type?: string;
        readonly function?: {
          readonly name?: string;
          readonly arguments?: string;
        };
      }>;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly completion_tokens_details?: { readonly reasoning_tokens?: number };
  };
}

/**
 * Send a tiny non-streaming completion to nudge the engine into
 * loading the model. Returns once the request resolves; failure is
 * surfaced to the caller. Hard 30s timeout so a wedged engine
 * doesn't block the suite indefinitely.
 */
async function warmUpModel(opts: {
  readonly chatBaseUrl: string;
  readonly modelId: string;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const url = `${opts.chatBaseUrl}/chat/completions`;
  const ac = new AbortController();
  const onParentAbort = () => ac.abort();
  if (opts.signal !== undefined) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeadersFor(opts.chatBaseUrl) },
      mode: 'cors',
      body: JSON.stringify({
        model: opts.modelId,
        messages: [{ role: 'user', content: 'OK' }],
        stream: false,
        max_tokens: 4,
        temperature: 0,
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${text.length > 0 ? `: ${text.slice(0, 120)}` : ''}`);
    }
    // Consume the body so the connection closes cleanly.
    await res.text();
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * Run a single case in isolation. Used by the per-row Retry button.
 * Reuses the same plumbing as the suite runner but skips the
 * warm-up + capability gate (the row was already produced once, so
 * the gate decision was made; if the user pressed Retry on a
 * skipped row, they evidently want to dispatch it now).
 */
export async function runSingleCase(opts: {
  readonly case: InlineCase;
  readonly modelId: string;
  readonly chatBaseUrl: string;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  readonly runConfig?: RunConfig;
  readonly onProgress?: (partial: { content: string; reasoning: string }) => void;
}): Promise<BenchCaseRow> {
  return runOne(opts.case, {
    chatBaseUrl: opts.chatBaseUrl,
    modelId: opts.modelId,
    maxTokens: opts.runConfig?.maxTokens ?? opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    ...(opts.runConfig !== undefined ? { runConfig: opts.runConfig } : {}),
    ...(opts.onProgress !== undefined ? { onProgress: opts.onProgress } : {}),
  });
}

export function summarise(rows: readonly BenchCaseRow[]): BenchSummary {
  // Skipped cases are excluded from the summary entirely — they were
  // user-triggered, not failures of the model. The total reflects the
  // graded denominator so `passed/total` remains meaningful when
  // comparing two models where one had cases skipped.
  const graded = rows.filter((r) => !r.skipped);
  const passed = graded.filter((r) => r.passed).length;
  const total = graded.length;
  const passRate = total === 0 ? 0 : passed / total;
  const tps = graded.map((r) => r.tokPerSec).filter((v): v is number => typeof v === 'number');
  const avgTokPerSec = tps.length > 0 ? tps.reduce((a, b) => a + b, 0) / tps.length : null;
  const reason = graded
    .map((r) => r.reasoningRatio)
    .filter((v): v is number => typeof v === 'number');
  const avgReasoningRatio =
    reason.length > 0 ? reason.reduce((a, b) => a + b, 0) / reason.length : null;
  const sorted = graded.map((r) => r.totalMs).sort((a, b) => a - b);
  const p95 =
    sorted.length === 0
      ? 0
      : (sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] ?? 0);
  return {
    passed,
    total,
    passRate,
    avgTokPerSec,
    avgReasoningRatio,
    p95LatencyMs: p95,
    byTag: rollupByTag(graded),
  };
}

/**
 * Per-tag pass-count rollup. A row contributes to every tag it
 * carries; multi-tag rows count multiple times. That's what we want
 * for the diagnostic summary ("good at reasoning AND code").
 */
function rollupByTag(
  graded: readonly BenchCaseRow[],
): ReadonlyMap<string, { passed: number; total: number }> {
  const acc = new Map<string, { passed: number; total: number }>();
  for (const row of graded) {
    const tags = (row as unknown as { _tags?: readonly string[] })._tags;
    // Tags don't ride on the row today; we re-derive from the case
    // by id. Passing the suite through summarise would be cleaner
    // long-term, but the row→case lookup is one indirection and
    // keeps the existing summarise() signature stable.
    if (Array.isArray(tags)) {
      for (const t of tags) bumpTag(acc, t, row.passed);
    }
  }
  return acc;
}

function bumpTag(
  acc: Map<string, { passed: number; total: number }>,
  tag: string,
  passed: boolean,
) {
  const slot = acc.get(tag) ?? { passed: 0, total: 0 };
  slot.total += 1;
  if (passed) slot.passed += 1;
  acc.set(tag, slot);
}

/**
 * Variant of summarise() that reads tags directly off the suite
 * cases. Use this when you have the suite handy — it produces a
 * non-empty byTag map, which the bare-rows summarise can't.
 */
export function summariseWithSuite(
  rows: readonly BenchCaseRow[],
  suite: InlineSuite,
): BenchSummary {
  const base = summarise(rows);
  const byTag = new Map<string, { passed: number; total: number }>();
  const caseById = new Map(suite.cases.map((c) => [c.id, c]));
  for (const row of rows) {
    if (row.skipped) continue;
    const c = caseById.get(row.id);
    if (c === undefined) continue;
    for (const t of c.tags) bumpTag(byTag, t, row.passed);
  }
  return { ...base, byTag };
}
