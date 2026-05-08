'use client';

/**
 * Universal generation-parameters panel for /local-models. Sits
 * between the discovery section and the Run rating section.
 *
 * Every field is honoured per request via the OpenAI-compat body
 * (`temperature`, `top_p`, `max_tokens`, `seed`, `system` message,
 * `reasoning_effort`). Engine-specific load-time settings (GPU
 * offload, KV cache, context length) are NOT controllable from a
 * browser fetch — see `engine-setup-tips.tsx` for the reference
 * panel that documents how to set them in each engine's UI/CLI.
 *
 * Persistence: localStorage key `openbench-local:run-config`. A
 * single profile applies to every selected model. Per-model
 * overrides are out of scope for v1 (most users tweak globals).
 */

import * as Switch from '@radix-ui/react-switch';
import { useCallback, useEffect, useState } from 'react';
import type { RunConfig } from './bench-direct';

const STORAGE_KEY = 'openbench-local:run-config';
const ENABLED_STORAGE_KEY = 'openbench-local:run-config-enabled';

const DEFAULTS: Required<Omit<RunConfig, 'reasoningEffort'>> & {
  reasoningEffort: RunConfig['reasoningEffort'] | 'off';
} = {
  temperature: 0,
  topP: 1,
  maxTokens: 8192,
  seed: 0,
  systemPrompt: '',
  reasoningEffort: 'off',
  warmUp: true,
};

interface Props {
  readonly value: RunConfig;
  readonly onChange: (next: RunConfig) => void;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly disabled?: boolean;
}

export function RunConfigPanel({ value, onChange, enabled, onEnabledChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const set = useCallback(
    <K extends keyof RunConfig>(key: K, v: RunConfig[K]) => {
      onChange({ ...value, [key]: v });
    },
    [value, onChange],
  );

  const isCustom = !isAllDefault(value);

  return (
    <section
      className={`rounded-2xl border border-border bg-bg-elevated shadow-sm print:hidden ${
        enabled ? '' : 'opacity-70'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${
              !enabled ? 'bg-fg-faint' : isCustom ? 'bg-accent' : 'bg-fg-faint'
            }`}
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Setup
            </p>
            <h2 className="mt-0.5 text-sm font-semibold text-fg">
              Generation parameters
              {!enabled ? (
                <span className="ml-2 rounded-full bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                  off · per-model only
                </span>
              ) : isCustom ? (
                <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                  customised
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 max-w-xl text-[11px] text-fg-muted">
              {enabled
                ? 'Applied to every selected model. Wins over per-model settings; per-model values fill only the fields you leave unset here.'
                : 'Toggle on to force these values across every selected model. While off, only each model’s own per-model config (gear icon) is used.'}
            </p>
          </div>
          <span className="ml-auto font-mono text-[11px] text-fg-muted">
            {enabled ? summariseConfig(value) : 'inactive'}
          </span>
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 text-fg-muted transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path
              d="M4 2 L8 6 L4 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <span className="text-[11px] font-medium text-fg-muted">Override</span>
            <Switch.Root
              checked={enabled}
              onCheckedChange={onEnabledChange}
              disabled={disabled}
              aria-label="Activate global override"
              className="relative h-5 w-9 cursor-pointer rounded-full bg-bg-subtle outline-none transition-colors data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-bg-elevated shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[1.125rem]" />
            </Switch.Root>
          </label>
          {isCustom && enabled ? (
            <button
              type="button"
              onClick={() => onChange({})}
              disabled={disabled}
              className="rounded border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
            >
              Reset
            </button>
          ) : null}
        </div>
      </header>

      {open ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
          <Field
            label="Temperature"
            help="0 = deterministic. Higher = more random. The bench's pass/fail tests all assume 0."
          >
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={value.temperature ?? DEFAULTS.temperature}
              onChange={(e) => set('temperature', Number.parseFloat(e.target.value))}
              disabled={disabled}
              className="w-24 rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </Field>

          <Field
            label="Max tokens"
            help="Response length cap. 0 = unlimited (engine uses its full context budget — risk: a stuck case can hang for minutes). Reasoning models benefit from ≥4096."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="64"
                min="0"
                max="65536"
                value={value.maxTokens ?? DEFAULTS.maxTokens}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  set('maxTokens', Number.isFinite(n) ? n : DEFAULTS.maxTokens);
                }}
                disabled={disabled}
                className="w-24 rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => set('maxTokens', 0)}
                disabled={disabled}
                title="No cap — let the engine decide"
                className="rounded border border-border bg-bg px-2 py-1 text-[11px] text-fg-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                ∞
              </button>
              {(value.maxTokens ?? DEFAULTS.maxTokens) === 0 ? (
                <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400">
                  unlimited
                </span>
              ) : null}
            </div>
          </Field>

          <Field
            label="Top-p"
            help="Nucleus sampling. 1 = no truncation. Most engines ignore this when temperature is 0."
          >
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={value.topP ?? DEFAULTS.topP}
              onChange={(e) => set('topP', Number.parseFloat(e.target.value))}
              disabled={disabled}
              className="w-24 rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </Field>

          <Field
            label="Seed"
            help="Integer seed. Honoured by Ollama and vLLM; ignored by some llama.cpp builds."
          >
            <input
              type="number"
              step="1"
              value={value.seed ?? DEFAULTS.seed}
              onChange={(e) => set('seed', Number.parseInt(e.target.value, 10))}
              disabled={disabled}
              className="w-24 rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </Field>

          <Field
            label="Reasoning effort"
            help="For o1 / qwq / deepseek-r1 / qwen3-thinking. Ignored by non-reasoning models."
          >
            <select
              value={value.reasoningEffort ?? 'off'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'off') {
                  const { reasoningEffort: _drop, ...rest } = value;
                  void _drop;
                  onChange(rest);
                } else {
                  set('reasoningEffort', v as 'low' | 'medium' | 'high');
                }
              }}
              disabled={disabled}
              className="w-32 rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="off">off (default)</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>

          <Field
            label="Warm-up ping"
            help="Send a tiny request before case 1 so cold-load doesn't pollute the first row's TTFT."
          >
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.warmUp ?? DEFAULTS.warmUp}
                onChange={(e) => set('warmUp', e.target.checked)}
                disabled={disabled}
                className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <span className="text-[12px] text-fg-muted">Enabled by default</span>
            </label>
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="System prompt"
              help="Prepended as a system message on every case. Empty = no system message."
            >
              <textarea
                value={value.systemPrompt ?? ''}
                onChange={(e) => set('systemPrompt', e.target.value)}
                disabled={disabled}
                rows={3}
                placeholder="(none — only the user message is sent)"
                className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-50"
              />
            </Field>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          {label}
        </span>
      </div>
      {children}
      {help !== undefined ? <p className="text-[11px] text-fg-muted">{help}</p> : null}
    </div>
  );
}

function isAllDefault(c: RunConfig): boolean {
  if (c.temperature !== undefined && c.temperature !== DEFAULTS.temperature) return false;
  if (c.topP !== undefined && c.topP !== DEFAULTS.topP) return false;
  if (c.maxTokens !== undefined && c.maxTokens !== DEFAULTS.maxTokens) return false;
  if (c.seed !== undefined && c.seed !== DEFAULTS.seed) return false;
  if (c.systemPrompt !== undefined && c.systemPrompt.length > 0) return false;
  if (c.reasoningEffort !== undefined) return false;
  if (c.warmUp !== undefined && c.warmUp !== DEFAULTS.warmUp) return false;
  return true;
}

function summariseConfig(c: RunConfig): string {
  const parts: string[] = [];
  parts.push(`temp ${c.temperature ?? DEFAULTS.temperature}`);
  parts.push(`max ${c.maxTokens ?? DEFAULTS.maxTokens}`);
  if (c.systemPrompt !== undefined && c.systemPrompt.trim().length > 0) parts.push('+ system');
  if (c.reasoningEffort !== undefined) parts.push(`thinking: ${c.reasoningEffort}`);
  if (c.warmUp === false) parts.push('no warm-up');
  return parts.join(' · ');
}

/** Read the persisted config once on mount; write back on change. */
export function useStoredRunConfig(): {
  config: RunConfig;
  setConfig: (next: RunConfig) => void;
} {
  const [config, setConfigState] = useState<RunConfig>({});
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return;
      setConfigState(parsed as RunConfig);
    } catch {
      // corrupt storage — start clean
    }
  }, []);
  const setConfig = useCallback((next: RunConfig) => {
    setConfigState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // quota / disabled
    }
  }, []);
  return { config, setConfig };
}

/**
 * Persist whether the global Setup panel is acting as an override.
 * Default ON — that's the natural assumption when a user has filled
 * the panel. When OFF, the panel is shown muted and the runner
 * ignores its values entirely (only per-model settings apply).
 */
export function useStoredRunConfigEnabled(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
} {
  // Default OFF: per-model defaults (and the engine's own defaults
  // for fields the user leaves unset there) win. Users opt into the
  // global override deliberately when they want to force the same
  // params across every model regardless of per-model setup.
  const [enabled, setEnabledState] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ENABLED_STORAGE_KEY);
      if (raw === null) return;
      // Stored value is "true" | "false". Anything else: keep default.
      if (raw === 'true' || raw === 'false') setEnabledState(raw === 'true');
    } catch {
      // ignore
    }
  }, []);
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      // quota / disabled
    }
  }, []);
  return { enabled, setEnabled };
}
