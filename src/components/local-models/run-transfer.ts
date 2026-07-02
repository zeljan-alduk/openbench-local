/**
 * Results that travel — versioned run export/import + share links.
 *
 * Two transports, two fidelity levels:
 *
 *   1. File envelope (`openbench-run-v1`): full-fidelity StoredRun
 *      records (rows, outputs, reasoning, params). Lossless by
 *      construction — it IS the history record. Import a friend's
 *      file and their runs overlay yours in the comparison table and
 *      chart. Deliberately separate from report-export.ts, which is a
 *      lossy human-readable report.
 *
 *   2. URL fragment (`#share=1.<base64url(deflate-raw(JSON))>`):
 *      summary-only — model, params, pass counts, per-tag rollup, and
 *      per-case verdict bits. Full runs are 100 KB–MBs and never
 *      URL-safe; a summary deflates to well under 2 KB. The payload
 *      lives in the hash, so it never leaves the browser in a request.
 *
 * Import rules: records are validated DEEPLY before anything is
 * persisted (a wrapper-shaped file with garbage rows must not poison
 * IndexedDB); imported sessions are namespaced `imported:<original>`
 * so they never merge with local sessions; runId collisions —
 * including duplicates WITHIN one file — are re-keyed with the
 * original id kept in `importedRunId`.
 */

import type { BenchCaseRow } from './bench-direct';
import type { RunConfig } from './bench-direct';
import {
  putRun,
  type RunOrigin,
  type SerialisedSummary,
  type StoredRun,
} from './history-store';

export const RUN_EXPORT_FORMAT = 'openbench-run-v1';

export interface RunExportFileV1 {
  readonly format: typeof RUN_EXPORT_FORMAT;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly runs: readonly StoredRun[];
}

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

export function encodeRunExport(runs: readonly StoredRun[]): string {
  const doc: RunExportFileV1 = {
    format: RUN_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    runs,
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse + deeply validate an export file. Throws with a user-facing
 * message on a wrong format tag or a structurally broken file;
 * individually broken runs are dropped into `warnings` instead of
 * failing the whole import.
 */
export function decodeRunExport(json: string): { runs: StoredRun[]; warnings: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Not a JSON file.');
  }
  if (raw === null || typeof raw !== 'object' || (raw as { format?: unknown }).format !== RUN_EXPORT_FORMAT) {
    throw new Error(
      `Unrecognised file — expected an openbench run export ({"format":"${RUN_EXPORT_FORMAT}"}). The report JSON from "Export → JSON" is not importable; use "Export runs" in History.`,
    );
  }
  const list = (raw as { runs?: unknown }).runs;
  if (!Array.isArray(list)) throw new Error('Export file has no runs array.');
  const runs: StoredRun[] = [];
  const warnings: string[] = [];
  list.forEach((entry, i) => {
    const errors = validateStoredRun(entry);
    if (errors.length === 0) {
      runs.push(entry as StoredRun);
    } else {
      warnings.push(`run[${i}] skipped: ${errors[0]}`);
    }
  });
  if (runs.length === 0 && warnings.length > 0) {
    throw new Error(`No valid runs in file (${warnings.length} invalid). ${warnings[0]}`);
  }
  return { runs, warnings };
}

/** Structural validation deep enough that a persisted record can't break the UI. */
export function validateStoredRun(raw: unknown): string[] {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object') return ['not an object'];
  const r = raw as Record<string, unknown>;
  if (typeof r.runId !== 'string' || r.runId === '') errors.push('missing runId');
  if (typeof r.sessionId !== 'string' || r.sessionId === '') errors.push('missing sessionId');
  if (typeof r.startedAt !== 'number') errors.push('missing startedAt');
  if (typeof r.finishedAt !== 'number') errors.push('missing finishedAt');
  const model = r.model as Record<string, unknown> | null | undefined;
  if (model === null || model === undefined || typeof model !== 'object') {
    errors.push('missing model');
  } else {
    if (typeof model.id !== 'string') errors.push('model.id must be a string');
    if (typeof model.source !== 'string') errors.push('model.source must be a string');
    if (typeof model.chatBaseUrl !== 'string') errors.push('model.chatBaseUrl must be a string');
  }
  if (!Array.isArray(r.rows)) {
    errors.push('rows must be an array');
  } else {
    for (const row of r.rows as unknown[]) {
      const rowErr = validateRow(row);
      if (rowErr !== null) {
        errors.push(rowErr);
        break;
      }
    }
  }
  if (r.summary !== null && r.summary !== undefined) {
    const s = r.summary as Record<string, unknown>;
    if (
      typeof s.passed !== 'number' ||
      typeof s.total !== 'number' ||
      typeof s.passRate !== 'number' ||
      !Array.isArray(s.byTag)
    ) {
      errors.push('summary shape invalid (needs passed/total/passRate/byTag entries)');
    }
  }
  if (typeof r.phase !== 'string') errors.push('missing phase');
  if (r.runConfig === null || typeof r.runConfig !== 'object') errors.push('missing runConfig');
  return errors;
}

function validateRow(row: unknown): string | null {
  if (row === null || typeof row !== 'object') return 'row is not an object';
  const x = row as Record<string, unknown>;
  if (typeof x.id !== 'string') return 'row.id must be a string';
  if (typeof x.passed !== 'boolean') return `row "${String(x.id)}": passed must be boolean`;
  if (typeof x.input !== 'string') return `row "${String(x.id)}": input must be a string`;
  if (typeof x.output !== 'string') return `row "${String(x.id)}": output must be a string`;
  if (x.expect === null || typeof x.expect !== 'object') return `row "${String(x.id)}": missing expect`;
  return null;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ImportResult {
  readonly imported: number;
  readonly failed: number;
  readonly renumbered: number;
  readonly storedRuns: readonly StoredRun[];
}

/**
 * Persist validated runs with origin/namespacing rules. `existingIds`
 * are the runIds already in history; ids seen during THIS batch are
 * added to the collision set as we go, so a file containing the same
 * runId twice re-keys the second copy instead of overwriting.
 */
export async function importRuns(
  runs: readonly StoredRun[],
  existingIds: ReadonlySet<string>,
): Promise<ImportResult> {
  const have = new Set(existingIds);
  let imported = 0;
  let failed = 0;
  let renumbered = 0;
  const storedRuns: StoredRun[] = [];
  for (const run of runs) {
    const collided = have.has(run.runId);
    const runId = collided ? newId() : run.runId;
    const record: StoredRun = {
      ...run,
      runId,
      sessionId: run.sessionId.startsWith('imported:')
        ? run.sessionId
        : `imported:${run.sessionId}`,
      origin: (run.origin === 'shared-link' ? 'shared-link' : 'imported') satisfies RunOrigin,
      ...(collided ? { importedRunId: run.runId } : {}),
      schemaVersion: 2,
    };
    // putRun reports whether the write landed (quota, private mode…) —
    // never count a swallowed failure as imported.
    const ok = await putRun(record);
    if (ok) {
      imported += 1;
      if (collided) renumbered += 1;
      have.add(runId);
      storedRuns.push(record);
    } else {
      failed += 1;
    }
  }
  return { imported, failed, renumbered, storedRuns };
}

// ── URL-fragment share links (summary only) ─────────────────────────

export interface ShareSummaryV1 {
  readonly v: 1;
  readonly kind: 'summary';
  readonly model: { readonly id: string; readonly source: string; readonly contextTokens?: number };
  readonly suiteVersion?: string;
  readonly appVersion: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly runConfig: RunConfig;
  readonly summary: SerialisedSummary;
  /** Per-case verdicts: [caseId, 0=fail | 1=pass | 2=skip]. Dropped first when the URL runs long. */
  readonly caseResults?: ReadonlyArray<readonly [string, 0 | 1 | 2]>;
}

const SHARE_PREFIX = '#share=1.';
/** Practical hash budget — chat apps and some browsers mangle much beyond this. */
const SHARE_MAX_CHARS = 8000;

export function shareSummaryFromStored(run: StoredRun): ShareSummaryV1 | null {
  if (run.summary === null) return null;
  return {
    v: 1,
    kind: 'summary',
    model: {
      id: run.model.id,
      source: run.model.source,
      ...(run.model.contextTokens !== undefined ? { contextTokens: run.model.contextTokens } : {}),
    },
    ...(run.suiteVersion !== undefined ? { suiteVersion: run.suiteVersion } : {}),
    appVersion: run.appVersion ?? appVersion(),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    runConfig: run.runConfig,
    summary: run.summary,
    caseResults: run.rows.map(
      (row: BenchCaseRow) => [row.id, row.skipped ? 2 : row.passed ? 1 : 0] as const,
    ),
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deflate(json: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(json)])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** True when this browser can build/open share links (Safari < 16.4 can't). */
export function shareLinksSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * Build the `#share=…` fragment. Tries the full payload first; when
 * the fragment would exceed the practical URL budget it retries
 * without `caseResults`, and returns null only if even the bare
 * summary doesn't fit (or the browser lacks CompressionStream).
 */
export async function encodeShareFragment(p: ShareSummaryV1): Promise<string | null> {
  if (!shareLinksSupported()) return null;
  const attempt = async (payload: ShareSummaryV1) =>
    `${SHARE_PREFIX}${base64UrlEncode(await deflate(JSON.stringify(payload)))}`;
  const full = await attempt(p);
  if (full.length <= SHARE_MAX_CHARS) return full;
  const { caseResults: _drop, ...slim } = p;
  void _drop;
  const bare = await attempt(slim as ShareSummaryV1);
  return bare.length <= SHARE_MAX_CHARS ? bare : null;
}

/** Decode a location.hash. Returns null (never throws) on anything unrecognisable. */
export async function decodeShareFragment(hash: string): Promise<ShareSummaryV1 | null> {
  if (!hash.startsWith(SHARE_PREFIX) || !shareLinksSupported()) return null;
  try {
    const json = await inflate(base64UrlDecode(hash.slice(SHARE_PREFIX.length)));
    const p = JSON.parse(json) as ShareSummaryV1;
    if (p.v !== 1 || p.kind !== 'summary') return null;
    if (typeof p.model?.id !== 'string' || p.summary === null || typeof p.summary !== 'object') {
      return null;
    }
    if (typeof p.summary.passed !== 'number' || typeof p.summary.total !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

/** True when the app was opened via a share link. */
export function hasShareFragment(hash: string): boolean {
  return hash.startsWith(SHARE_PREFIX);
}
