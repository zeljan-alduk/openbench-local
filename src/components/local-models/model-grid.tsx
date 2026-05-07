'use client';

/**
 * Multi-selectable card grid of discovered local LLMs.
 *
 * Each card carries the model id, source/port badge, and a row of
 * capability chips (Vision / Tool Use / Reasoning / Embedding)
 * inferred from the model id — see `capabilities.ts` for the
 * heuristics. False negatives are fine; we never claim a capability
 * we can't infer with confidence.
 *
 * Selection is multi: clicking a card toggles its membership in the
 * selected set. The shell runs the suite against every selected model
 * sequentially (never in parallel — bandwidth + RAM contention on a
 * laptop are real, and parallel runs would also distort tok/s).
 */

import { inferCapabilities } from './capabilities';
import { CapabilityChip } from './capability-chip';
import type { DiscoveredLocalModel } from './discovery-direct';
import { type SelectedKey, modelKey } from './selection';

interface Props {
  readonly models: readonly DiscoveredLocalModel[];
  readonly selectedKeys: ReadonlySet<SelectedKey>;
  readonly onToggle: (m: DiscoveredLocalModel) => void;
  /** Open the per-model config modal. When omitted, the gear icon is hidden. */
  readonly onConfigure?: (m: DiscoveredLocalModel) => void;
  /** Set of model keys that have an active per-model override. Drives the "custom" chip. */
  readonly customisedKeys?: ReadonlySet<SelectedKey>;
  /** When true, cards do not respond to clicks (e.g. while a run is in flight). */
  readonly disabled?: boolean;
}

export function ModelGrid({
  models,
  selectedKeys,
  onToggle,
  onConfigure,
  customisedKeys,
  disabled,
}: Props) {
  if (models.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {models.map((m) => {
        const key = modelKey(m);
        const selected = selectedKeys.has(key);
        const customised = customisedKeys?.has(key) ?? false;
        return (
          <li key={key} className="relative">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (!disabled) onToggle(m);
              }}
              disabled={disabled}
              className={[
                'group flex w-full flex-col gap-3 rounded-xl border bg-bg p-4 text-left transition-all',
                disabled ? 'cursor-not-allowed opacity-60' : '',
                selected
                  ? 'border-accent shadow-sm ring-2 ring-accent/30'
                  : 'border-border hover:border-accent/50 hover:bg-bg-subtle',
              ].join(' ')}
            >
              <div
                className={[
                  'flex items-start justify-between gap-2',
                  // Reserve room in the top-right corner for the
                  // absolute gear button so the source badge isn't
                  // truncated underneath it.
                  onConfigure !== undefined ? 'pr-9' : '',
                ].join(' ')}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <SelectCheckbox checked={selected} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium text-fg" title={m.id}>
                      {m.id}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-fg-muted">
                      {m.displayBaseUrl}
                    </p>
                  </div>
                </div>
                <SourceBadge source={m.source} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-fg-muted">
                {typeof m.contextTokens === 'number' && m.contextTokens > 0 ? (
                  <Chip>{formatContext(m.contextTokens)} ctx</Chip>
                ) : null}
                {(() => {
                  const caps = inferCapabilities(m.id);
                  return (
                    <>
                      {caps.embedding ? <CapabilityChip kind="embedding" /> : null}
                      {caps.vision ? <CapabilityChip kind="vision" /> : null}
                      {caps.toolUse ? <CapabilityChip kind="tool_use" /> : null}
                      {caps.reasoning ? <CapabilityChip kind="reasoning" /> : null}
                    </>
                  );
                })()}
                {customised ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                    title="Per-model overrides active"
                  >
                    Custom
                  </span>
                ) : null}
                {selected ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    Selected
                  </span>
                ) : null}
              </div>
            </button>
            {onConfigure !== undefined ? (
              <button
                type="button"
                aria-label={`Configure ${m.id}`}
                title="Configure run parameters for this model"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disabled) onConfigure(m);
                }}
                disabled={disabled}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg-elevated text-fg-muted shadow-sm transition-colors hover:border-accent/60 hover:text-fg disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                  <path
                    d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M8 1.5v1.8 M8 12.7v1.8 M14.5 8h-1.8 M3.3 8H1.5 M12.6 3.4l-1.27 1.27 M4.67 11.33 3.4 12.6 M12.6 12.6l-1.27-1.27 M4.67 4.67 3.4 3.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-bg group-hover:border-accent/60',
      ].join(' ')}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path
            d="M2 6 L5 9 L10 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-bg-subtle px-1.5 py-0.5 font-medium">{children}</span>;
}

function SourceBadge({ source }: { source: string }) {
  const palette: Record<string, string> = {
    ollama: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
    lmstudio: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    vllm: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    llamacpp: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        palette[source] ?? 'bg-bg-subtle text-fg-muted'
      }`}
    >
      {source}
    </span>
  );
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
