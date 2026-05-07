'use client';

/**
 * Per-runtime probe status strip. Renders all four well-known
 * runtimes with their probe outcome:
 *
 *   ✓ N models        — probed, parsed, found models
 *   ✓ probed (empty)  — probed, parsed, but no models registered
 *   ✗ no response     — fetch failed (port closed OR CORS blocked)
 *   ⚠ HTTP <code>     — server replied with a non-2xx
 *   ⚠ bad JSON        — response wasn't OpenAI-shaped
 *
 * For the ✗ case (the ambiguous "is it CORS?" one), expand inline with
 * the runtime's CORS recipe so the user can fix it without leaving the
 * page. This is the path the user hit: Ollama running but no
 * OLLAMA_ORIGINS set → CORS-blocked → ✗.
 */

import { useState } from 'react';
import { CopyableCommand } from './copyable-command';
import { CORS_RECIPES, RUNTIME_ORDER } from './cors-recipes';
import type { DiscoveryProbeResult, DiscoverySource } from './discovery-direct';

interface Props {
  readonly probes: readonly DiscoveryProbeResult[];
}

export function ProbeStatus({ probes }: Props) {
  // Stable order — ollama, lmstudio, vllm, llamacpp — and pull each
  // probe by source so the UI is the same shape regardless of probe
  // resolution order.
  const bySource = new Map<DiscoverySource, DiscoveryProbeResult>();
  for (const p of probes) bySource.set(p.source, p);

  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
        Probe status
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {RUNTIME_ORDER.map((src) => {
          const p = bySource.get(src);
          return <ProbeRow key={src} source={src} probe={p} />;
        })}
      </ul>
    </div>
  );
}

function ProbeRow({
  source,
  probe,
}: {
  source: DiscoverySource;
  probe: DiscoveryProbeResult | undefined;
}) {
  const recipe = CORS_RECIPES[source];
  const [open, setOpen] = useState(false);

  const status = describe(probe);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fg">{recipe.runtime}</p>
          <p className="font-mono text-[10px] text-fg-muted">port {recipe.port}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusGlyph kind={status.kind} />
          <span
            className={`font-mono text-[11px] ${
              status.kind === 'ok'
                ? 'text-emerald-700 dark:text-emerald-400'
                : status.kind === 'fail'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-fg-muted'
            }`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {status.kind === 'fail' || status.kind === 'warn' ? (
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            {open ? 'Hide CORS fix' : `Fix CORS for ${recipe.runtime}`}
          </button>
          {open ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <CopyableCommand command={recipe.command} />
              <p className="text-[11px] text-fg-muted">{recipe.hint}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StatusGlyph({ kind }: { kind: 'ok' | 'fail' | 'warn' | 'idle' }) {
  if (kind === 'ok') {
    return (
      <span
        aria-label="responded"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"
      >
        ✓
      </span>
    );
  }
  if (kind === 'fail') {
    return (
      <span
        aria-label="no response"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-700 dark:text-amber-400"
      >
        ✗
      </span>
    );
  }
  if (kind === 'warn') {
    return (
      <span
        aria-label="warning"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-700 dark:text-amber-400"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-label="idle"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-subtle text-[10px] text-fg-muted"
    >
      —
    </span>
  );
}

function describe(p: DiscoveryProbeResult | undefined): {
  kind: 'ok' | 'fail' | 'warn' | 'idle';
  label: string;
} {
  if (p === undefined) return { kind: 'idle', label: 'not probed' };
  if (p.ok) {
    return {
      kind: 'ok',
      label: `${p.models.length} model${p.models.length === 1 ? '' : 's'}`,
    };
  }
  switch (p.reason) {
    case 'fetch_failed':
      return { kind: 'fail', label: 'no response · CORS?' };
    case 'http_error':
      return { kind: 'warn', label: `HTTP ${p.httpStatus ?? '?'}` };
    case 'parse_error':
      return { kind: 'warn', label: 'unexpected body' };
    case 'empty':
      return { kind: 'ok', label: '0 models' };
    default:
      return { kind: 'idle', label: 'unknown' };
  }
}
