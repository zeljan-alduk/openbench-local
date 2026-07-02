'use client';

/**
 * Read-only card shown when the app is opened via a `#share=` link.
 * Renders the summary-only payload (outputs are never in a link) with
 * a "Save to history" CTA that persists it as a rows-empty StoredRun
 * so it can overlay local results in the comparison views.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { putRun, type StoredRun } from './history-store';
import { type ShareSummaryV1 } from './run-transfer';
import { wilsonInterval } from './stats';
import { passBarClass, passTextClass } from './status-colors';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SharedRunCard({
  payload,
  onDismiss,
  onSaved,
}: {
  payload: ShareSummaryV1;
  onDismiss: () => void;
  /** Called with the persisted record so the shell can merge it into `runs`. */
  onSaved: (stored: StoredRun) => void;
}): ReactElement {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const s = payload.summary;
  const pct = Math.round(s.passRate * 100);
  const ci = s.total >= 5 ? wilsonInterval(s.passed, s.total) : null;
  const tags = [...s.byTag].sort(([, a], [, b]) => b.total - a.total);

  const onSave = useCallback(async () => {
    setSaveState('saving');
    const stored: StoredRun = {
      runId: newId(),
      sessionId: `shared:${payload.startedAt}`,
      startedAt: payload.startedAt,
      finishedAt: payload.finishedAt,
      model: {
        id: payload.model.id,
        source: payload.model.source as StoredRun['model']['source'],
        host: 'shared-link',
        port: 0,
        chatBaseUrl: '',
        displayBaseUrl: 'shared link',
        capability: 'chat',
        ...(payload.model.contextTokens !== undefined
          ? { contextTokens: payload.model.contextTokens }
          : {}),
      },
      phase: 'done',
      rows: [],
      summary: s,
      error: null,
      warmUp: null,
      runConfig: payload.runConfig,
      schemaVersion: 2,
      ...(payload.suiteVersion !== undefined ? { suiteVersion: payload.suiteVersion } : {}),
      appVersion: payload.appVersion,
      origin: 'shared-link',
    };
    const ok = await putRun(stored);
    if (ok) {
      setSaveState('saved');
      onSaved(stored);
    } else {
      setSaveState('failed');
    }
  }, [payload, s, onSaved]);

  return (
    <section className="rounded-2xl border border-accent/40 bg-bg-elevated p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
            Shared result — summary only
          </p>
          <p className="mt-1 truncate font-mono text-sm font-medium text-fg" title={payload.model.id}>
            {payload.model.id}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
            {payload.model.source} · run {new Date(payload.finishedAt).toLocaleString()} · app v
            {payload.appVersion}
            {payload.suiteVersion !== undefined ? ` · suite v${payload.suiteVersion}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-fg-faint">
            Model outputs are not included in share links — ask the sender for an “Export runs”
            file for the full transcript.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saveState === 'saving' || saveState === 'saved'}
            className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
          >
            {saveState === 'saved' ? 'Saved to history' : saveState === 'saving' ? 'Saving…' : 'Save to history'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:text-fg"
            aria-label="Dismiss shared result"
          >
            Dismiss
          </button>
        </div>
      </div>
      {saveState === 'failed' ? (
        <p className="mt-2 rounded-md bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          Could not persist to browser storage (quota or private mode) — the card stays until you
          dismiss it.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-bg px-4 py-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-fg-muted">Pass</p>
          <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${passTextClass(pct)}`}>
            {s.passed}/{s.total}
            <span className="ml-1 text-[10px] font-normal text-fg-muted">{pct}%</span>
          </p>
          {ci !== null ? (
            <p className="font-mono text-[10px] text-fg-faint">
              95% CI {Math.round(ci.lo * 100)}–{Math.round(ci.hi * 100)}%
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-fg-muted">Avg tok/s</p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-fg">
            {s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-fg-muted">P95 latency</p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-fg">
            {(s.p95LatencyMs / 1000).toFixed(1)} s
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-fg-muted">Params</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">
            {describeConfig(payload.runConfig)}
          </p>
        </div>
      </div>

      {tags.length > 0 ? (
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {tags.map(([tag, { passed, total }]) => {
            const tagPct = total === 0 ? 0 : Math.round((passed / total) * 100);
            return (
              <li key={tag} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate font-mono text-[11px] text-fg">{tag}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                  <div className={`h-full ${passBarClass(tagPct)}`} style={{ width: `${Math.max(4, tagPct)}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-muted">
                  {passed}/{total}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {payload.caseResults !== undefined ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Per-case verdicts
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1" aria-hidden>
            {payload.caseResults.map(([id, verdict]) => (
              <span
                key={id}
                title={`${id}: ${verdict === 1 ? 'pass' : verdict === 2 ? 'skipped' : 'fail'}`}
                className={`h-2.5 w-2.5 rounded-sm ${
                  verdict === 1 ? 'bg-emerald-500' : verdict === 2 ? 'bg-border' : 'bg-red-500'
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function describeConfig(cfg: ShareSummaryV1['runConfig']): string {
  const parts: string[] = [];
  if (cfg.temperature !== undefined) parts.push(`temp ${cfg.temperature}`);
  if (cfg.topP !== undefined) parts.push(`top_p ${cfg.topP}`);
  if (cfg.seed !== undefined) parts.push(`seed ${cfg.seed}`);
  if (cfg.reasoningEffort !== undefined) parts.push(`reason ${cfg.reasoningEffort}`);
  if (cfg.repeatCount !== undefined && cfg.repeatCount > 1) parts.push(`×${cfg.repeatCount}`);
  return parts.length > 0 ? parts.join(' · ') : 'engine defaults';
}
