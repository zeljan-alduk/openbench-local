'use client';

/**
 * Run-history browser dialog.
 *
 * Shows everything persisted in IndexedDB grouped by session
 * (newest first). Each row is one model run; the user can pick
 * arbitrary runs via checkboxes and delete them in bulk, delete a
 * full session, or wipe the entire history. The shell consumes
 * delete events to keep the visible `runs` array in sync.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RunConfig } from './bench-direct';
import { passTextClass } from './status-colors';
import {
  clearAll as clearAllRuns,
  deleteRun,
  deleteSession,
  getAllRuns,
  type StoredRun,
} from './history-store';
import {
  decodeRunExport,
  encodeRunExport,
  encodeShareFragment,
  importRuns,
  shareLinksSupported,
  shareSummaryFromStored,
} from './run-transfer';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Called after the dialog deletes one or more runs from IDB so
   * the parent can drop them from its in-memory `runs` too. The
   * argument is the set of runIds that were removed.
   */
  readonly onRunsDeleted: (runIds: ReadonlySet<string>) => void;
  /**
   * Called when the user wipes everything. Parent should clear
   * its in-memory state.
   */
  readonly onWipeAll: () => void;
  /** Called with the freshly persisted records after a successful import. */
  readonly onRunsImported: (runs: readonly StoredRun[]) => void;
}

interface SessionGroup {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly runs: readonly StoredRun[];
}

export function HistoryDialog({ open, onOpenChange, onRunsDeleted, onWipeAll, onRunsImported }: Props) {
  const [stored, setStored] = useState<readonly StoredRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [transferNote, setTransferNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllRuns();
      setStored(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
      setSelected(new Set());
      setConfirmWipe(false);
    }
  }, [open, refresh]);

  const groups = useMemo<SessionGroup[]>(() => {
    const bySession = new Map<string, StoredRun[]>();
    for (const r of stored) {
      const arr = bySession.get(r.sessionId) ?? [];
      arr.push(r);
      bySession.set(r.sessionId, arr);
    }
    const out: SessionGroup[] = [];
    for (const [sessionId, runs] of bySession.entries()) {
      const sorted = runs.slice().sort((a, b) => a.startedAt - b.startedAt);
      const startedAt = sorted[0]?.startedAt ?? 0;
      out.push({ sessionId, startedAt, runs: sorted });
    }
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out;
  }, [stored]);

  const totalRuns = stored.length;
  const allSelected = totalRuns > 0 && selected.size === totalRuns;

  const toggleRun = (runId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const toggleSession = (group: SessionGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allInGroup = group.runs.every((r) => next.has(r.runId));
      if (allInGroup) {
        for (const r of group.runs) next.delete(r.runId);
      } else {
        for (const r of group.runs) next.add(r.runId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(stored.map((r) => r.runId)));
  };

  const onDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = new Set(selected);
    for (const id of ids) {
      await deleteRun(id);
    }
    onRunsDeleted(ids);
    setSelected(new Set());
    await refresh();
  };

  const onDeleteSession = async (sessionId: string) => {
    const group = groups.find((g) => g.sessionId === sessionId);
    if (group === undefined) return;
    await deleteSession(sessionId);
    onRunsDeleted(new Set(group.runs.map((r) => r.runId)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of group.runs) next.delete(r.runId);
      return next;
    });
    await refresh();
  };

  const onDeleteOne = async (runId: string) => {
    await deleteRun(runId);
    onRunsDeleted(new Set([runId]));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
    await refresh();
  };

  const onWipeAllClick = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    await clearAllRuns();
    onWipeAll();
    setSelected(new Set());
    setConfirmWipe(false);
    await refresh();
  };

  // Export selected runs (or everything when nothing is ticked) as a
  // lossless, re-importable openbench-run-v1 file. Rows in IDB are
  // already image-slimmed, so the file stays reasonably sized.
  const onExportRuns = () => {
    const picked = selected.size > 0 ? stored.filter((r) => selected.has(r.runId)) : stored;
    if (picked.length === 0) return;
    const blob = new Blob([encodeRunExport(picked)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openbench-runs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setTransferNote({
      tone: 'ok',
      text: `Exported ${picked.length} ${picked.length === 1 ? 'run' : 'runs'} — share the file; others import it right here.`,
    });
  };

  const onImportFile = async (file: File) => {
    try {
      const { runs, warnings } = decodeRunExport(await file.text());
      const existing = new Set(stored.map((r) => r.runId));
      const result = await importRuns(runs, existing);
      if (result.imported > 0) onRunsImported(result.storedRuns);
      await refresh();
      const bits: string[] = [`Imported ${result.imported} ${result.imported === 1 ? 'run' : 'runs'}`];
      if (result.renumbered > 0) bits.push(`${result.renumbered} re-keyed (id collision)`);
      if (result.failed > 0) bits.push(`${result.failed} failed to persist (storage quota?)`);
      if (warnings.length > 0) bits.push(`${warnings.length} skipped as invalid`);
      setTransferNote({
        tone: result.failed > 0 || warnings.length > 0 ? 'warn' : 'ok',
        text: `${bits.join(' · ')}.`,
      });
    } catch (e) {
      setTransferNote({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-bg-elevated shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2 className="text-base font-semibold text-fg">Run history</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="mt-0.5 text-[12px] text-fg-muted">
                  {totalRuns === 0
                    ? 'No saved runs yet.'
                    : `${totalRuns} stored ${totalRuns === 1 ? 'run' : 'runs'} across ${groups.length} ${
                        groups.length === 1 ? 'session' : 'sessions'
                      }. Tick the runs you want to delete or wipe everything.`}
                </p>
              </Dialog.Description>
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

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <p className="text-sm text-fg-muted">Loading…</p>
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-fg-muted">
                No saved runs. Run a benchmark — finished runs are saved here automatically.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <SessionBlock
                    key={g.sessionId}
                    group={g}
                    selected={selected}
                    onToggleRun={toggleRun}
                    onToggleSession={() => toggleSession(g)}
                    onDeleteSession={() => {
                      void onDeleteSession(g.sessionId);
                    }}
                    onDeleteOne={(runId) => {
                      void onDeleteOne(runId);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {transferNote !== null ? (
            <p
              className={`mx-5 mb-1 rounded-md px-3 py-1.5 text-[11px] ${
                transferNote.tone === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
              }`}
            >
              {transferNote.text}
            </p>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/40 px-5 py-3">
            <label className="flex items-center gap-2 text-[12px] text-fg-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={totalRuns === 0}
                className="h-3.5 w-3.5 accent-accent"
              />
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f !== undefined) void onImportFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/60"
                title="Import an openbench-run-v1 JSON file — imported runs overlay your own in the comparison"
              >
                Import runs
              </button>
              <button
                type="button"
                onClick={onExportRuns}
                disabled={totalRuns === 0}
                className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                title="Export the ticked runs (or everything) as a lossless, re-importable JSON file"
              >
                {selected.size > 0 ? `Export ${selected.size}` : 'Export runs'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void onDeleteSelected();
                }}
                disabled={selected.size === 0}
                className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg hover:border-red-500/50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-red-400"
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={() => {
                  void onWipeAllClick();
                }}
                disabled={totalRuns === 0}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50',
                  confirmWipe
                    ? 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400'
                    : 'border-border bg-bg text-fg hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400',
                ].join(' ')}
              >
                {confirmWipe ? 'Click again to confirm wipe' : 'Delete all'}
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SessionBlock({
  group,
  selected,
  onToggleRun,
  onToggleSession,
  onDeleteSession,
  onDeleteOne,
}: {
  group: SessionGroup;
  selected: ReadonlySet<string>;
  onToggleRun: (runId: string) => void;
  onToggleSession: () => void;
  onDeleteSession: () => void;
  onDeleteOne: (runId: string) => void;
}) {
  const allChecked = group.runs.every((r) => selected.has(r.runId));
  const someChecked = !allChecked && group.runs.some((r) => selected.has(r.runId));
  return (
    <details className="group rounded-lg border border-border bg-bg" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el !== null) el.indeterminate = someChecked;
            }}
            onChange={onToggleSession}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 accent-accent"
            aria-label="Select all in session"
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Session
          </span>
          <span className="font-mono text-[12px] text-fg" title={new Date(group.startedAt).toLocaleString()}>
            {fmtDateTime(group.startedAt)}
          </span>
          <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            {group.runs.length} {group.runs.length === 1 ? 'model' : 'models'}
          </span>
          <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-90">
            ▸
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDeleteSession();
          }}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-[10px] text-fg-muted hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400"
          title="Delete this entire session"
        >
          Delete session
        </button>
      </summary>
      <div className="border-t border-border">
        {group.runs.map((r) => (
          <RunRow
            key={r.runId}
            run={r}
            checked={selected.has(r.runId)}
            onToggle={() => onToggleRun(r.runId)}
            onDelete={() => onDeleteOne(r.runId)}
          />
        ))}
      </div>
    </details>
  );
}

function RunRow({
  run,
  checked,
  onToggle,
  onDelete,
}: {
  run: StoredRun;
  checked: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const s = run.summary;
  const passLabel = s === null ? '—' : `${s.passed}/${s.total}`;
  const passPct = s === null ? null : Math.round(s.passRate * 100);
  const passClass = passTextClass(passPct);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onShare = async () => {
    const payload = shareSummaryFromStored(run);
    if (payload === null) {
      setShareState('failed');
      return;
    }
    const fragment = await encodeShareFragment(payload);
    if (fragment === null) {
      setShareState('failed');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${fragment}`;
    try {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(url);
      } else {
        // Clipboard API unavailable (http, older browser) — legacy path.
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch {
      setShareState('failed');
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 accent-accent"
        aria-label={`Select run ${run.model.id}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[12px] text-fg" title={run.model.id}>
            {run.model.id}
          </span>
          <span className="font-mono text-[10px] text-fg-muted">{run.model.source}</span>
          <span className="font-mono text-[10px] text-fg-faint">
            {fmtTimeOnly(run.startedAt)}
          </span>
          <OriginBadge origin={run.origin} />
        </div>
        <ParamLine config={run.runConfig} />
      </div>
      <div className="flex items-center gap-3 text-right">
        <div className="font-mono text-[11px] tabular-nums">
          <span className={passClass}>{passLabel}</span>
          {passPct !== null ? (
            <span className="ml-1 text-[10px] font-normal text-fg-muted">{passPct}%</span>
          ) : null}
        </div>
        <div className="hidden font-mono text-[11px] tabular-nums text-fg sm:block">
          {s === null || s.avgTokPerSec === null ? '—' : `${s.avgTokPerSec.toFixed(1)} tok/s`}
        </div>
        {shareLinksSupported() && s !== null ? (
          <button
            type="button"
            onClick={() => void onShare()}
            className={`rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
              shareState === 'copied'
                ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                : shareState === 'failed'
                  ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                  : 'border-border bg-bg text-fg-muted hover:border-accent/60 hover:text-fg'
            }`}
            title="Copy a share link — summary only (pass rates, per-tag rollup, per-case verdicts); outputs are never in the link"
          >
            {shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Too large' : 'Share'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-[10px] text-fg-muted hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400"
          title="Delete this run"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function OriginBadge({ origin }: { origin: StoredRun['origin'] }) {
  if (origin === undefined || origin === 'local') return null;
  return (
    <span
      className="rounded-full bg-sky-500/15 px-2 py-0.5 font-mono text-[9px] font-semibold text-sky-700 dark:text-sky-400"
      title={origin === 'imported' ? 'Imported from a run-export file' : 'Saved from a share link'}
    >
      {origin === 'imported' ? 'imported' : 'via link'}
    </span>
  );
}

function ParamLine({ config }: { config: RunConfig }) {
  const bits: string[] = [];
  if (config.temperature !== undefined) bits.push(`temp=${config.temperature}`);
  if (config.topP !== undefined) bits.push(`top_p=${config.topP}`);
  if (config.maxTokens !== undefined) bits.push(`max=${config.maxTokens}`);
  if (config.seed !== undefined) bits.push(`seed=${config.seed}`);
  if (config.reasoningEffort !== undefined) bits.push(`reason=${config.reasoningEffort}`);
  if (config.repeatCount !== undefined && config.repeatCount > 1) bits.push(`×${config.repeatCount}`);
  if (bits.length === 0) return null;
  return (
    <p className="mt-0.5 truncate font-mono text-[10px] text-fg-faint">{bits.join(' · ')}</p>
  );
}

function fmtDateTime(epoch: number): string {
  const d = new Date(epoch);
  const date = d.toLocaleDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function fmtTimeOnly(epoch: number): string {
  const d = new Date(epoch);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
