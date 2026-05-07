'use client';

/**
 * `/local-models` — top-level interactive island.
 *
 * Runs entirely from the browser:
 *   - discovery: probe well-known LLM ports on `127.0.0.1` directly
 *     via `fetch()` (no API server in the path — the hosted control
 *     plane can't reach the visitor's loopback anyway).
 *   - bench: stream `/chat/completions` from the browser, score with
 *     a tiny browser-side evaluator port, render rows as they finish.
 *
 * Multiselect comparison: clicking model cards toggles them into the
 * selected set. Pressing "Run rating" iterates the selection in order
 * (sequential, never parallel — bandwidth + RAM contention on a laptop
 * is real and parallel runs would also distort tok/s).
 *
 * Two cancellation surfaces:
 *   - Stop:  global abort → cuts the current case, doesn't queue the
 *            next models, marks pending models as "stopped".
 *   - Skip:  per-case abort → cuts the in-flight case, marks the row
 *            as `skipped: true` (excluded from pass-rate denominator),
 *            continues with the next case (or next model).
 *
 * When every probe fails (most likely cause: CORS preflight blocked
 * because the LLM didn't allow our origin), we surface a CORS help
 * panel with copy-pasteable per-runtime config.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type BenchCaseRow,
  runBenchDirect,
  runSingleCase,
  summariseWithSuite,
} from './bench-direct';
import { LOCAL_MODEL_RATING_SUITE } from './builtin-suite';
import { inferCapabilities } from './capabilities';
import { CorsHelpPanel } from './cors-help-panel';
import { CustomHostsPanel, useStoredHosts } from './custom-hosts-panel';
import {
  type DiscoverDirectResult,
  type DiscoveredLocalModel,
  type DiscoverySource,
  discoverDirect,
} from './discovery-direct';
import { EngineSetupTips } from './engine-setup-tips';
import { ModelConfigModal } from './model-config-modal';
import { ModelGrid } from './model-grid';
import { type ModelRunState, MultiBenchPanel, type RunPhase } from './multi-bench-panel';
import { mergeRunConfig, usePerModelConfig } from './per-model-config';
import { ProbeStatus } from './probe-status';
import { downloadHtml, downloadJson, downloadMarkdown, openPrint } from './report-export';
import { RunConfigPanel, useStoredRunConfig, useStoredRunConfigEnabled } from './run-config-panel';
import { type SelectedKey, modelKey } from './selection';

type Phase = 'idle' | 'scanning' | 'ready' | 'running' | 'done' | 'error';

export function LocalModelsShell() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [scan, setScan] = useState<DiscoverDirectResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<SelectedKey>>(new Set());
  const [runs, setRuns] = useState<readonly ModelRunState[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const { hosts: extraHosts, setHosts: setExtraHosts } = useStoredHosts();
  const { config: runConfig, setConfig: setRunConfig } = useStoredRunConfig();
  const { enabled: runConfigEnabled, setEnabled: setRunConfigEnabled } =
    useStoredRunConfigEnabled();
  const {
    map: perModelMap,
    get: getPerModel,
    set: setPerModel,
    clear: clearPerModel,
  } = usePerModelConfig();
  const [configModalModel, setConfigModalModel] = useState<DiscoveredLocalModel | null>(null);
  // Global abort: stops the whole campaign across all selected models.
  const globalAbortRef = useRef<AbortController | null>(null);
  // Per-case abort: skip just the in-flight case, run continues.
  const caseSkipRef = useRef<(() => void) | null>(null);
  // Wall-clock start of the in-flight bench, for the elapsed timer.
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const startScan = useCallback(async (hostsForScan: readonly string[]) => {
    setPhase('scanning');
    setScan(null);
    try {
      const r = await discoverDirect({ extraHosts: hostsForScan });
      setScan(r);
      setSelectedKeys((prev) => {
        // Auto-pick the first discovered model on the very first scan
        // so a one-model laptop still gets a one-click run experience.
        if (prev.size > 0) return prev;
        const first = r.models[0];
        if (first === undefined) return prev;
        return new Set([modelKey(first)]);
      });
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  // Track the latest host list in a ref so the rescan-on-change effect
  // and the manual Rescan button both read the same source of truth
  // without making startScan churn its identity.
  const hostsRef = useRef<readonly string[]>(extraHosts);
  hostsRef.current = extraHosts;

  // Initial scan + auto-rescan when the host list changes.
  useEffect(() => {
    void startScan(extraHosts);
  }, [startScan, extraHosts]);

  const onRescan = useCallback(() => {
    void startScan(hostsRef.current);
  }, [startScan]);

  const toggleSelected = useCallback((m: DiscoveredLocalModel) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = modelKey(m);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  // Resolve the ordered list of selected models from the scan + selection set.
  const selectedList = useMemo<DiscoveredLocalModel[]>(() => {
    const found = scan?.models ?? [];
    return found.filter((m) => selectedKeys.has(modelKey(m)));
  }, [scan, selectedKeys]);

  const startBench = useCallback(async () => {
    if (selectedList.length === 0) return;
    setRunError(null);
    setPhase('running');
    const ac = new AbortController();
    globalAbortRef.current = ac;

    // Initialise per-model run state up-front so the comparison strip
    // shows every queued model immediately, not as cases stream in.
    const initial: ModelRunState[] = selectedList.map((m, idx) => ({
      model: m,
      phase: idx === 0 ? 'running' : 'queued',
      rows: [],
      summary: null,
      error: null,
      inFlight: null,
      warmUp: null,
    }));
    setRuns(initial);
    setRunStartedAt(performance.now());

    try {
      for (let mi = 0; mi < selectedList.length; mi++) {
        if (ac.signal.aborted) break;
        const m = selectedList[mi];
        if (m === undefined) continue;
        if (mi > 0) {
          setRuns((prev) =>
            prev.map((r, i) => (i === mi ? { ...r, phase: 'running' as RunPhase } : r)),
          );
        }
        const accumulated: BenchCaseRow[] = [];
        try {
          const caps = inferCapabilities(m.id);
          const effectiveRunConfig = mergeRunConfig(
            runConfigEnabled ? runConfig : {},
            getPerModel(modelKey(m)),
          );
          const res = await runBenchDirect({
            suite: LOCAL_MODEL_RATING_SUITE,
            modelId: m.id,
            chatBaseUrl: m.chatBaseUrl,
            signal: ac.signal,
            modelCapabilities: { toolUse: caps.toolUse, vision: caps.vision },
            runConfig: effectiveRunConfig,
            onWarmUp: (warmUp) => {
              setRuns((prev) => prev.map((r, i) => (i === mi ? { ...r, warmUp } : r)));
            },
            onCaseStart: (caseId, skip) => {
              caseSkipRef.current = skip;
              setRuns((prev) =>
                prev.map((r, i) =>
                  i === mi
                    ? {
                        ...r,
                        inFlight: {
                          caseId,
                          content: '',
                          reasoning: '',
                          startedAt: performance.now(),
                        },
                      }
                    : r,
                ),
              );
            },
            onCaseProgress: (caseId, partial) => {
              setRuns((prev) =>
                prev.map((r, i) => {
                  if (i !== mi || r.inFlight === null || r.inFlight.caseId !== caseId) return r;
                  return {
                    ...r,
                    inFlight: {
                      ...r.inFlight,
                      content: partial.content,
                      reasoning: partial.reasoning,
                    },
                  };
                }),
              );
            },
            onCase: (row) => {
              accumulated.push(row);
              const snapshot = [...accumulated];
              const summary = summariseWithSuite(snapshot, LOCAL_MODEL_RATING_SUITE);
              setRuns((prev) =>
                prev.map((r, i) =>
                  i === mi ? { ...r, rows: snapshot, summary, inFlight: null } : r,
                ),
              );
            },
          });
          // Decide how this model's run terminated. If the global abort
          // fired during this model, we mark it stopped; otherwise it
          // ran to completion (some cases may have been skipped — those
          // are still a "done" outcome from the campaign's perspective).
          const finalPhase: RunPhase = ac.signal.aborted ? 'stopped' : 'done';
          setRuns((prev) =>
            prev.map((r, i) =>
              i === mi ? { ...r, phase: finalPhase, summary: res.summary, inFlight: null } : r,
            ),
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setRuns((prev) =>
            prev.map((r, i) =>
              i === mi ? { ...r, phase: 'error' as RunPhase, error: msg, inFlight: null } : r,
            ),
          );
        } finally {
          caseSkipRef.current = null;
        }
      }
      // Mark any models we didn't reach (because of global stop) as stopped.
      setRuns((prev) =>
        prev.map((r) => (r.phase === 'queued' ? { ...r, phase: 'stopped' as RunPhase } : r)),
      );
      setPhase('done');
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      globalAbortRef.current = null;
      caseSkipRef.current = null;
    }
  }, [selectedList, runConfig, runConfigEnabled, getPerModel]);

  const stopBench = useCallback(() => {
    globalAbortRef.current?.abort();
  }, []);

  const skipCase = useCallback(() => {
    caseSkipRef.current?.();
  }, []);

  const clearResults = useCallback(() => {
    setRuns([]);
    setRunError(null);
    setRunStartedAt(null);
    setElapsedMs(0);
    setPhase((p) => (p === 'done' || p === 'error' ? 'ready' : p));
  }, []);

  // Elapsed timer: re-render every 500ms while running so the
  // status strip shows wall-clock progress. Cleaned up on unmount or
  // when the run ends. This drives both the elapsed display and the
  // estimated-remaining label.
  useEffect(() => {
    if (phase !== 'running' || runStartedAt === null) return;
    const tick = () => setElapsedMs(performance.now() - runStartedAt);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, runStartedAt]);

  // Retry one case for one model. Replaces the row at the existing
  // index in that model's `rows` array; preserves all other rows.
  const retryCase = useCallback(
    async (modelKeyTarget: string, caseId: string) => {
      const c = LOCAL_MODEL_RATING_SUITE.cases.find((x) => x.id === caseId);
      if (c === undefined) return;
      const target = runs.find(
        (r) => `${r.model.source}::${r.model.id}::${r.model.port}` === modelKeyTarget,
      );
      if (target === undefined) return;
      try {
        const fresh = await runSingleCase({
          case: c,
          modelId: target.model.id,
          chatBaseUrl: target.model.chatBaseUrl,
          runConfig: mergeRunConfig(runConfigEnabled ? runConfig : {}, getPerModel(modelKeyTarget)),
        });
        setRuns((prev) =>
          prev.map((r) => {
            if (`${r.model.source}::${r.model.id}::${r.model.port}` !== modelKeyTarget) return r;
            const idx = r.rows.findIndex((x) => x.id === caseId);
            if (idx < 0) return r;
            const nextRows = [...r.rows];
            nextRows[idx] = fresh;
            const summary = summariseWithSuite(nextRows, LOCAL_MODEL_RATING_SUITE);
            return { ...r, rows: nextRows, summary };
          }),
        );
      } catch (e) {
        // Retry errors flash via the row's error field; if the runOne
        // path itself threw (rare — it usually catches internally),
        // surface a generic note.
        const msg = e instanceof Error ? e.message : String(e);
        setRunError(`Retry failed: ${msg}`);
      }
    },
    [runs, runConfig, runConfigEnabled, getPerModel],
  );

  // Set of model keys with active per-model overrides — drives the
  // "Custom" chip on the model cards.
  const customisedKeySet = useMemo<ReadonlySet<SelectedKey>>(
    () => new Set(Object.keys(perModelMap) as SelectedKey[]),
    [perModelMap],
  );

  // Source list for the engine-setup-tips strip — every distinct
  // source we probed, ordered with the ones that responded first.
  const tipSources = useMemo<readonly DiscoverySource[]>(() => {
    const probed = (scan?.probes ?? []).map((p) => ({ source: p.source, ok: p.ok }));
    const seen = new Set<DiscoverySource>();
    const ordered: DiscoverySource[] = [];
    for (const p of probed.filter((x) => x.ok))
      if (!seen.has(p.source)) {
        seen.add(p.source);
        ordered.push(p.source);
      }
    for (const p of probed.filter((x) => !x.ok))
      if (!seen.has(p.source)) {
        seen.add(p.source);
        ordered.push(p.source);
      }
    return ordered;
  }, [scan]);

  // Export actions. Markdown + JSON build a blob and trigger a
  // download via a hidden anchor; PDF goes through window.print()
  // and the print stylesheet. The export context carries the
  // global config + global toggle + per-model overrides so the
  // exported report shows the exact params each model ran with.
  const exportCtx = useMemo(
    () => ({
      runs,
      globalConfig: runConfig,
      globalEnabled: runConfigEnabled,
      perModel: perModelMap,
    }),
    [runs, runConfig, runConfigEnabled, perModelMap],
  );
  const onExportHtml = useCallback(() => downloadHtml(exportCtx), [exportCtx]);
  const onExportMarkdown = useCallback(() => downloadMarkdown(exportCtx), [exportCtx]);
  const onExportJson = useCallback(() => downloadJson(exportCtx), [exportCtx]);
  const onPrintReport = useCallback(() => openPrint(), []);

  const totalCasesPerModel = LOCAL_MODEL_RATING_SUITE.cases.length;
  const completedRows = useMemo(() => runs.reduce((sum, r) => sum + r.rows.length, 0), [runs]);
  const totalRows = totalCasesPerModel * Math.max(1, selectedList.length);
  const progress =
    phase === 'running' && totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;

  const found = scan?.models ?? [];
  const showCorsHelp = phase === 'ready' && (scan?.likelyBlocked ?? false);
  const showEmpty = phase === 'ready' && found.length === 0 && !showCorsHelp;
  const selectionLabel =
    selectedList.length === 0
      ? 'Pick at least one discovered model.'
      : selectedList.length === 1
        ? '1 model selected — pick more to compare side-by-side.'
        : `${selectedList.length} models selected — they will run sequentially.`;

  return (
    <div className="flex flex-col gap-6">
      <StatusStrip
        phase={phase}
        scan={scan}
        onRescan={onRescan}
        progress={progress}
        progressLabel={
          phase === 'running'
            ? `${completedRows}/${totalRows} cases · ${selectedList.length} model${selectedList.length === 1 ? '' : 's'}`
            : null
        }
        elapsedMs={phase === 'running' ? elapsedMs : null}
        estimateMs={
          phase === 'running' ? estimateRemaining(elapsedMs, completedRows, totalRows) : null
        }
      />

      <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Step 1
            </p>
            <h2 className="mt-1 text-base font-semibold text-fg">Discover local LLMs</h2>
          </div>
          <p className="font-mono text-[11px] text-fg-muted">
            Probing 127.0.0.1{extraHosts.length > 0 ? ` + ${extraHosts.length} custom` : ''} —
            Ollama · LM Studio · vLLM · llama.cpp
          </p>
        </header>
        <div className="flex flex-col gap-4 px-5 py-5">
          {phase === 'scanning' && found.length === 0 ? (
            <ScanningHint />
          ) : showCorsHelp ? (
            <CorsHelpPanel onRetry={onRescan} />
          ) : showEmpty ? (
            <NoServersFound onRetry={onRescan} />
          ) : (
            <ModelGrid
              models={found}
              selectedKeys={selectedKeys}
              onToggle={toggleSelected}
              onConfigure={(m) => setConfigModalModel(m)}
              customisedKeys={customisedKeySet}
              disabled={phase === 'running'}
            />
          )}
          {/* Per-probe transparency: which runtimes responded, which
              didn't, and an inline CORS recipe for the ones that
              failed. The big CorsHelpPanel above already covers the
              case where every probe failed — skip the strip there to
              avoid duplication. */}
          {scan !== null && !showCorsHelp ? <ProbeStatus probes={scan.probes} /> : null}
          <CustomHostsPanel
            hosts={extraHosts}
            onChange={setExtraHosts}
            disabled={phase === 'running' || phase === 'scanning'}
          />
          {tipSources.length > 0 ? (
            <div className="flex flex-col gap-2 print:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Engine setup tips
              </p>
              {tipSources.map((s) => (
                <EngineSetupTips key={s} source={s} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <RunConfigPanel
        value={runConfig}
        onChange={setRunConfig}
        enabled={runConfigEnabled}
        onEnabledChange={setRunConfigEnabled}
        disabled={phase === 'running' || phase === 'scanning'}
      />

      <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Step 2
            </p>
            <h2 className="mt-1 text-base font-semibold text-fg">Rate quality × speed</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-fg-muted">
              Eighteen cases probe instruction-following, JSON output, code reasoning, retrieval,
              multi-step inference, refusal, arithmetic, character-level reasoning, strict
              formatting, native tool calls, and vision (counting · OCR · spatial). Tool-use and
              vision cases auto-skip on models that lack the capability. Pick multiple models to
              compare side-by-side — they run one at a time.
            </p>
            <p className="mt-2 text-xs font-medium text-fg-muted">{selectionLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'running' ? (
              <>
                <button
                  type="button"
                  onClick={skipCase}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
                  title="Skip the in-flight case and continue with the next one"
                >
                  Skip case
                </button>
                <button
                  type="button"
                  onClick={stopBench}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
                  title="Stop the whole run — pending models will not start"
                >
                  Stop
                </button>
              </>
            ) : null}
            {phase !== 'running' && runs.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={onExportHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent print:hidden"
                  title="Download a self-contained interactive HTML report"
                >
                  Export to HTML
                </button>
                <ExportMoreMenu
                  onMarkdown={onExportMarkdown}
                  onJson={onExportJson}
                  onPrint={onPrintReport}
                />
                <button
                  type="button"
                  onClick={clearResults}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle print:hidden"
                  title="Drop the previous comparison so the next run starts from scratch"
                >
                  Clear results
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={startBench}
              disabled={selectedList.length === 0 || phase === 'running'}
              className={[
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all',
                selectedList.length > 0 && phase !== 'running'
                  ? 'bg-accent text-accent-fg hover:shadow-md'
                  : 'bg-bg-subtle text-fg-muted opacity-60',
              ].join(' ')}
            >
              {phase === 'running' ? (
                <>
                  <Spinner /> Running…
                </>
              ) : runs.length > 0 ? (
                <>Re-run →</>
              ) : selectedList.length > 1 ? (
                <>Compare {selectedList.length} models →</>
              ) : (
                <>Run rating →</>
              )}
            </button>
          </div>
        </header>

        <div className="px-5 py-5">
          {runError !== null ? (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {runError}
            </div>
          ) : null}
          {runs.length > 0 ? <PrintRunParams ctx={exportCtx} /> : null}
          {runs.length === 0 ? (
            <p className="text-sm text-fg-muted">
              {selectedList.length === 0
                ? 'Pick one or more discovered models above, then run the rating.'
                : 'Press “Run rating” to start.'}
            </p>
          ) : (
            <MultiBenchPanel
              runs={runs}
              suiteCases={totalCasesPerModel}
              onRetryCase={(modelKeyTarget, caseId) => {
                void retryCase(modelKeyTarget, caseId);
              }}
            />
          )}
        </div>
      </section>

      <ModelConfigModal
        open={configModalModel !== null}
        onOpenChange={(o) => {
          if (!o) setConfigModalModel(null);
        }}
        model={configModalModel}
        globalConfig={runConfig}
        override={configModalModel === null ? null : getPerModel(modelKey(configModalModel))}
        onSave={(override) => {
          if (configModalModel === null) return;
          setPerModel(modelKey(configModalModel), override);
        }}
        onClear={() => {
          if (configModalModel === null) return;
          clearPerModel(modelKey(configModalModel));
          setConfigModalModel(null);
        }}
      />
    </div>
  );
}

function StatusStrip({
  phase,
  scan,
  onRescan,
  progress,
  progressLabel,
  elapsedMs,
  estimateMs,
}: {
  phase: Phase;
  scan: DiscoverDirectResult | null;
  onRescan: () => void;
  progress: number;
  progressLabel: string | null;
  elapsedMs: number | null;
  estimateMs: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3 shadow-sm print:hidden">
      <PhaseBadge phase={phase} />
      <div className="min-w-0 flex-1 text-xs text-fg-muted">
        {phase === 'scanning' ? (
          <>Probing localhost ports…</>
        ) : phase === 'ready' ? (
          scan === null ? null : scan.models.length === 0 ? (
            <>
              No LLM servers responded on default ports.
              {scan.likelyBlocked ? ' CORS may be blocking — see below.' : ''}
            </>
          ) : (
            <>
              Found <span className="font-mono text-fg">{scan.models.length}</span> model
              {scan.models.length === 1 ? '' : 's'} on{' '}
              <span className="font-mono text-fg">localhost</span>.
            </>
          )
        ) : phase === 'running' ? (
          <>
            Rating in progress — {progressLabel}
            {elapsedMs !== null ? (
              <span className="ml-2 font-mono text-[11px] tabular-nums text-fg">
                {fmtElapsed(elapsedMs)}
              </span>
            ) : null}
            {estimateMs !== null && estimateMs > 0 ? (
              <span className="ml-1 text-fg-faint">≈ {fmtElapsed(estimateMs)} remaining</span>
            ) : null}
          </>
        ) : phase === 'done' ? (
          <>
            Run complete
            {elapsedMs !== null && elapsedMs > 0 ? (
              <span className="ml-1 text-fg-faint">in {fmtElapsed(elapsedMs)}</span>
            ) : null}
            .
          </>
        ) : phase === 'error' ? (
          <>Something went wrong. Click rescan to retry.</>
        ) : null}
      </div>
      {phase === 'running' ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bg-subtle">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-fg-muted">{progress}%</span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRescan}
        disabled={phase === 'scanning' || phase === 'running'}
        className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
      >
        Rescan
      </button>
    </div>
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

/**
 * Estimate time remaining based on observed throughput so far. Uses
 * a 5s-per-case prior until at least one case has actually
 * completed, then projects forward at the observed rate.
 */
function estimateRemaining(elapsed: number, completed: number, total: number): number | null {
  if (total === 0) return null;
  const remaining = Math.max(0, total - completed);
  if (remaining === 0) return 0;
  const perCase = completed > 0 ? elapsed / completed : 5_000;
  return Math.round(perCase * remaining);
}

/**
 * Secondary export options. The primary "Export to HTML" button is
 * rendered next to this; this dropdown holds the less-common
 * formats (markdown + json) plus the print-to-PDF fallback.
 */
function ExportMoreMenu({
  onMarkdown,
  onJson,
  onPrint,
}: {
  onMarkdown: () => void;
  onJson: () => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Other export formats"
      >
        More ▾
      </button>
      {open ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: closes via outside-click intent only.
        <div
          className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-border bg-bg-elevated p-1 shadow-md"
          onClick={() => setOpen(false)}
        >
          <MenuButton onClick={onMarkdown}>Markdown (.md)</MenuButton>
          <MenuButton onClick={onJson}>JSON (.json)</MenuButton>
          <MenuButton onClick={onPrint}>Print this page…</MenuButton>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-bg-subtle"
    >
      {children}
    </button>
  );
}

/**
 * Print-only summary of the global config + per-model overrides +
 * effective parameters per model. Hidden on screen; shown only in
 * the saved PDF so a reader can see exactly what config produced
 * each row.
 */
function PrintRunParams({
  ctx,
}: {
  ctx: {
    runs: readonly ModelRunState[];
    globalConfig: import('./bench-direct').RunConfig;
    globalEnabled: boolean;
    perModel: Readonly<Record<string, import('./bench-direct').RunConfig>>;
  };
}) {
  return (
    <div className="hidden print:mb-6 print:block">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-fg">
        Generation parameters
      </h3>
      <p className="mt-1 text-[11px] text-fg-muted">
        Global override: {ctx.globalEnabled ? 'active' : 'inactive (per-model only)'}
      </p>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-border bg-bg px-3 py-2 font-mono text-[11px] text-fg-muted">
        {paramsToText(ctx.globalConfig, '(global)')}
      </pre>
      {ctx.runs.map((r) => {
        const key = `${r.model.source}::${r.model.id}::${r.model.port}`;
        const override = ctx.perModel[key];
        if (override === undefined) return null;
        return (
          <div key={key} className="mt-2">
            <p className="text-[11px] font-semibold text-fg">Override · {r.model.id}</p>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border bg-bg px-3 py-2 font-mono text-[11px] text-fg-muted">
              {paramsToText(override, '(per-model)')}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function paramsToText(c: import('./bench-direct').RunConfig, label: string): string {
  const lines: string[] = [`# ${label}`];
  if (c.temperature !== undefined) lines.push(`temperature      ${c.temperature}`);
  if (c.maxTokens !== undefined) lines.push(`max_tokens       ${c.maxTokens}`);
  if (c.topP !== undefined) lines.push(`top_p            ${c.topP}`);
  if (c.seed !== undefined) lines.push(`seed             ${c.seed}`);
  if (c.reasoningEffort !== undefined) lines.push(`reasoning_effort ${c.reasoningEffort}`);
  if (c.warmUp !== undefined) lines.push(`warm_up          ${c.warmUp}`);
  if (c.systemPrompt !== undefined && c.systemPrompt.trim().length > 0) {
    lines.push(`system_prompt    "${c.systemPrompt.replace(/\s+/g, ' ').slice(0, 200)}"`);
  }
  if (lines.length === 1) lines.push('(no fields set — using defaults)');
  return lines.join('\n');
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; tone: string }> = {
    idle: { label: 'Idle', tone: 'bg-bg-subtle text-fg-muted' },
    scanning: { label: 'Scanning', tone: 'bg-accent/15 text-accent' },
    ready: { label: 'Ready', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    running: { label: 'Running', tone: 'bg-accent/15 text-accent' },
    done: { label: 'Done', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    error: { label: 'Error', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  };
  const { label, tone } = map[phase];
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

function ScanningHint() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-bg px-4 py-6 text-sm text-fg-muted">
      <Spinner />
      <span>Probing default LLM ports on 127.0.0.1…</span>
    </div>
  );
}

function NoServersFound({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-6 text-sm">
      <p className="font-medium text-fg">No local LLM servers responded.</p>
      <p className="mt-1 text-fg-muted">
        Start one of: Ollama (port 11434), LM Studio (1234), vLLM (8000), llama.cpp (8080) — then
        rescan.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-subtle"
      >
        Rescan
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
    />
  );
}
