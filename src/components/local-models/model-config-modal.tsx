'use client';

/**
 * Per-model RunConfig override dialog. Triggered by the gear icon on
 * each discovered-model card. Each field shows the global default as
 * a placeholder; setting a value overrides the global for this
 * model, leaving it unset inherits the global.
 *
 * Persistence is handled by the parent shell via usePerModelConfig.
 * This component is a controlled form — open/close + value/onChange
 * are owned upstream.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { RunConfig } from './bench-direct';
import type { DiscoveredLocalModel } from './discovery-direct';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly model: DiscoveredLocalModel | null;
  readonly globalConfig: RunConfig;
  readonly override: RunConfig | null;
  readonly onSave: (override: RunConfig) => void;
  readonly onClear: () => void;
}

export function ModelConfigModal({
  open,
  onOpenChange,
  model,
  globalConfig,
  override,
  onSave,
  onClear,
}: Props) {
  // Local draft state so unsaved edits don't pollute the persisted
  // map until the user clicks Save.
  const [draft, setDraft] = useState<RunConfig>(override ?? {});

  // Reset draft when the modal opens for a different model, or when
  // the upstream override changes (parent might have cleared it).
  useEffect(() => {
    if (open) setDraft(override ?? {});
  }, [open, override]);

  if (model === null) return null;

  const fallback = (key: keyof RunConfig, fallbackValue: number | string | boolean): string => {
    const v = globalConfig[key];
    return v === undefined ? `${fallbackValue} (default)` : `${String(v)} (global)`;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-bg-elevated shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2 className="truncate font-mono text-base font-semibold text-fg" title={model.id}>
                  {model.id}
                </h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">
                  {model.source} · {model.displayBaseUrl}
                </p>
              </Dialog.Description>
              <p className="mt-2 max-w-md text-[12px] leading-relaxed text-fg-muted">
                Per-model defaults for this exact endpoint. The global Setup panel takes precedence
                — values here only apply for fields the global panel leaves unset. Saved settings
                persist across sessions.
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                  <path
                    d="M3 3 L13 13 M13 3 L3 13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Dialog.Close>
          </header>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
            <NumField
              label="Temperature"
              value={draft.temperature}
              placeholder={fallback('temperature', 0)}
              step={0.1}
              min={0}
              max={2}
              onChange={(v) => setDraft(setField(draft, 'temperature', v))}
            />
            <NumField
              label="Max tokens"
              value={draft.maxTokens}
              placeholder={fallback('maxTokens', 1024)}
              step={64}
              min={64}
              max={32768}
              integer
              onChange={(v) => setDraft(setField(draft, 'maxTokens', v))}
            />
            <NumField
              label="Top-p"
              value={draft.topP}
              placeholder={fallback('topP', 1)}
              step={0.05}
              min={0}
              max={1}
              onChange={(v) => setDraft(setField(draft, 'topP', v))}
            />
            <NumField
              label="Seed"
              value={draft.seed}
              placeholder={fallback('seed', 0)}
              step={1}
              integer
              onChange={(v) => setDraft(setField(draft, 'seed', v))}
            />

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Reasoning effort
              </p>
              <select
                value={draft.reasoningEffort ?? '__inherit__'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__inherit__') {
                    const { reasoningEffort: _drop, ...rest } = draft;
                    void _drop;
                    setDraft(rest);
                  } else {
                    setDraft({ ...draft, reasoningEffort: v as 'low' | 'medium' | 'high' });
                  }
                }}
                className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="__inherit__">
                  inherit ({globalConfig.reasoningEffort ?? 'off'})
                </option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Warm-up ping
              </p>
              <select
                value={draft.warmUp === undefined ? '__inherit__' : draft.warmUp ? 'on' : 'off'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__inherit__') {
                    const { warmUp: _drop, ...rest } = draft;
                    void _drop;
                    setDraft(rest);
                  } else {
                    setDraft({ ...draft, warmUp: v === 'on' });
                  }
                }}
                className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="__inherit__">
                  inherit ({globalConfig.warmUp === false ? 'off' : 'on'})
                </option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                System prompt
              </p>
              <textarea
                value={draft.systemPrompt ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') {
                    const { systemPrompt: _drop, ...rest } = draft;
                    void _drop;
                    setDraft(rest);
                  } else {
                    setDraft({ ...draft, systemPrompt: v });
                  }
                }}
                rows={3}
                placeholder={
                  globalConfig.systemPrompt !== undefined && globalConfig.systemPrompt.length > 0
                    ? `(global: "${globalConfig.systemPrompt.slice(0, 80)}${globalConfig.systemPrompt.length > 80 ? '…' : ''}")`
                    : '(none — only the user message is sent)'
                }
                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClear}
              disabled={override === null}
              className="rounded border border-border bg-bg px-3 py-1.5 text-[12px] font-medium text-fg-muted hover:text-fg disabled:opacity-40"
              title="Drop all per-model overrides for this model"
            >
              Reset to global
            </button>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded border border-border bg-bg px-3 py-1.5 text-[12px] font-medium text-fg hover:bg-bg-subtle"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => {
                  onSave(draft);
                  onOpenChange(false);
                }}
                className="rounded bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg hover:opacity-90"
              >
                Save
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumField({
  label,
  value,
  placeholder,
  step,
  min,
  max,
  integer,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{label}</p>
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        {...(step !== undefined ? { step } : {})}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = integer === true ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
      />
    </div>
  );
}

/**
 * Update a field, deleting the key from the draft when `value` is
 * `undefined`. Setting the value to `undefined` via spread would
 * leave the key present-but-undefined in the object, which would
 * defeat the "leave blank to inherit global" UX.
 */
function setField<K extends keyof RunConfig>(
  draft: RunConfig,
  key: K,
  value: RunConfig[K] | undefined,
): RunConfig {
  if (value === undefined) {
    const { [key]: _drop, ...rest } = draft;
    void _drop;
    return rest as RunConfig;
  }
  return { ...draft, [key]: value };
}
