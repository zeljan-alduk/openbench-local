'use client';

/**
 * IndexedDB-backed run history.
 *
 * Each ModelRunState produced by a bench is stored as one record
 * keyed by `runId`. A `sessionId` groups runs that started together
 * (one batch / one Start click). Records survive page reloads and
 * accumulate across sessions until the user deletes them from the
 * History dialog or clicks "Clear results" (which only removes the
 * single most recent session).
 *
 * Why IndexedDB over localStorage: reasoning traces + outputs across
 * many runs blow past the 5-10 MB localStorage quota fast. IDB has
 * effectively unlimited space and async I/O that doesn't block the
 * main thread on writes. Image data URLs are still stripped before
 * persisting — they're rebuildable from the case definition.
 */

import type { BenchCaseRow, BenchSummary, RunConfig } from './bench-direct';
import type { DiscoveredLocalModel } from './discovery-direct';
import type { InFlightCase, ModelRunState, RunPhase } from './multi-bench-panel';

const DB_NAME = 'openbench-local';
const DB_VERSION = 1;
const STORE_RUNS = 'runs';
const INDEX_SESSION = 'sessionId';
const INDEX_FINISHED_AT = 'finishedAt';

/**
 * The on-disk shape. Mirrors ModelRunState but with run identity +
 * captured config and a serialised summary (byTag Map → entry list).
 */
export interface StoredRun {
  readonly runId: string;
  readonly sessionId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly model: DiscoveredLocalModel;
  readonly phase: RunPhase;
  readonly rows: readonly BenchCaseRow[];
  readonly summary: SerialisedSummary | null;
  readonly error: string | null;
  readonly warmUp: ModelRunState['warmUp'];
  readonly runConfig: RunConfig;
}

interface SerialisedSummary {
  readonly passed: number;
  readonly total: number;
  readonly passRate: number;
  readonly avgTokPerSec: number | null;
  readonly avgReasoningRatio: number | null;
  readonly p95LatencyMs: number;
  readonly byTag: ReadonlyArray<readonly [string, { passed: number; total: number }]>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const store = db.createObjectStore(STORE_RUNS, { keyPath: 'runId' });
        store.createIndex(INDEX_SESSION, 'sessionId', { unique: false });
        store.createIndex(INDEX_FINISHED_AT, 'finishedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): { store: IDBObjectStore; done: Promise<void> } {
  const t = db.transaction(STORE_RUNS, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new Error('IDB tx aborted'));
    t.onerror = () => reject(t.error ?? new Error('IDB tx error'));
  });
  return { store: t.objectStore(STORE_RUNS), done };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB request failed'));
  });
}

function serialiseSummary(s: BenchSummary | null): SerialisedSummary | null {
  if (s === null) return null;
  return {
    passed: s.passed,
    total: s.total,
    passRate: s.passRate,
    avgTokPerSec: s.avgTokPerSec,
    avgReasoningRatio: s.avgReasoningRatio,
    p95LatencyMs: s.p95LatencyMs,
    byTag: Array.from(s.byTag.entries()).map(([k, v]) => [k, { passed: v.passed, total: v.total }]),
  };
}

function deserialiseSummary(s: SerialisedSummary | null): BenchSummary | null {
  if (s === null) return null;
  return {
    passed: s.passed,
    total: s.total,
    passRate: s.passRate,
    avgTokPerSec: s.avgTokPerSec,
    avgReasoningRatio: s.avgReasoningRatio,
    p95LatencyMs: s.p95LatencyMs,
    byTag: new Map(s.byTag.map(([k, v]) => [k, { passed: v.passed, total: v.total }])),
  };
}

/** Strip image data URLs from rows — they can be megabytes each. */
function slimRows(rows: readonly BenchCaseRow[]): BenchCaseRow[] {
  return rows.map((row) => (row.imageDataUrl !== null ? { ...row, imageDataUrl: null } : row));
}

/**
 * Persist one finished model run. Caller is responsible for not
 * calling this before phase reaches done/stopped/error — we don't
 * want partial in-flight rows in the history.
 */
export async function putRun(run: StoredRun): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    store.put({ ...run, rows: slimRows(run.rows) });
    await done;
  } catch {
    // Persistence is best-effort. Quota exceeded / private mode /
    // browser bug — keep the in-memory copy and move on.
  }
}

export async function getAllRuns(): Promise<StoredRun[]> {
  try {
    const db = await openDb();
    const { store } = tx(db, 'readonly');
    const all = await req(store.getAll());
    return all as StoredRun[];
  } catch {
    return [];
  }
}

export async function deleteRun(runId: string): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    store.delete(runId);
    await done;
  } catch {
    /* ignore */
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    const idx = store.index(INDEX_SESSION);
    const keys = await req(idx.getAllKeys(IDBKeyRange.only(sessionId)));
    for (const k of keys) store.delete(k as IDBValidKey);
    await done;
  } catch {
    /* ignore */
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    store.clear();
    await done;
  } catch {
    /* ignore */
  }
}

/**
 * Convert a stored entry into the in-memory ModelRunState shape the
 * UI consumes.
 */
export function storedToRunState(s: StoredRun): ModelRunState & RunMeta {
  return {
    model: s.model,
    phase: s.phase,
    rows: s.rows,
    summary: deserialiseSummary(s.summary),
    error: s.error,
    inFlight: null as InFlightCase | null,
    warmUp: s.warmUp,
    runId: s.runId,
    sessionId: s.sessionId,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    runConfig: s.runConfig,
  };
}

/**
 * Run-identity metadata layered onto ModelRunState in memory. The
 * shell merges this in via type intersection so existing consumers
 * that only know about ModelRunState don't break.
 */
export interface RunMeta {
  readonly runId: string;
  readonly sessionId: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly runConfig: RunConfig;
}

/**
 * One-shot migration from the old `openbench-local:last-run`
 * localStorage key into IDB. Runs once per origin; the marker key
 * `openbench-local:history-migrated` flips to '1' after the first
 * successful pass (or after we determine there's nothing to migrate).
 */
const LEGACY_KEY = 'openbench-local:last-run';
const MIGRATION_FLAG = 'openbench-local:history-migrated';

export async function migrateLegacyLastRun(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === '1') return;
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw === null) {
      window.localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    const parsed = JSON.parse(raw) as {
      savedAt: number;
      runs: ModelRunState[];
      runCompletedAt: number | null;
      elapsedMs: number;
    };
    if (Array.isArray(parsed.runs) && parsed.runs.length > 0) {
      const sessionId = `legacy-${parsed.savedAt}`;
      const finishedAt = parsed.runCompletedAt ?? parsed.savedAt;
      const startedAt = finishedAt - (parsed.elapsedMs ?? 0);
      for (let i = 0; i < parsed.runs.length; i++) {
        const r = parsed.runs[i];
        if (r === undefined) continue;
        await putRun({
          runId: `${sessionId}-${i}`,
          sessionId,
          startedAt,
          finishedAt,
          model: r.model,
          phase: r.phase === 'queued' || r.phase === 'running' ? 'stopped' : r.phase,
          rows: r.rows,
          summary: serialiseSummary(r.summary),
          error: r.error,
          warmUp: r.warmUp,
          runConfig: {},
        });
      }
    }
    window.localStorage.setItem(MIGRATION_FLAG, '1');
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore — migration failures shouldn't block the page */
  }
}

export { serialiseSummary };
