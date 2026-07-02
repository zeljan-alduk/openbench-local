/**
 * Tests for the run export/import envelope and share-link codec.
 * (importRuns' IDB persistence is exercised in the browser; here we
 * pin the validation and the fragment round-trip, which are pure.)
 */

import { describe, expect, it } from 'vitest';
import type { StoredRun } from './history-store';
import {
  decodeRunExport,
  decodeShareFragment,
  encodeRunExport,
  encodeShareFragment,
  hasShareFragment,
  shareSummaryFromStored,
  validateStoredRun,
} from './run-transfer';

function storedRun(overrides?: Partial<StoredRun>): StoredRun {
  return {
    runId: 'r1',
    sessionId: 's1',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_600_000,
    model: {
      id: 'llama3.1:8b',
      source: 'ollama',
      host: '127.0.0.1',
      port: 11434,
      chatBaseUrl: 'http://127.0.0.1:11434/v1',
      displayBaseUrl: 'http://127.0.0.1:11434',
      capability: 'chat',
    },
    phase: 'done',
    rows: [
      {
        id: 'case-1',
        passed: true,
        score: 1,
        totalMs: 1200,
        ttftMs: 80,
        tokensIn: 20,
        tokensOut: 5,
        tokPerSec: 4,
        reasoningRatio: null,
        input: 'Reply with PASS.',
        expect: { kind: 'contains', value: 'PASS' },
        output: 'PASS',
        reasoningOutput: '',
        toolCalls: [],
        imageDataUrl: null,
        skipped: false,
      },
    ],
    summary: {
      passed: 1,
      total: 1,
      passRate: 1,
      avgTokPerSec: 4,
      avgReasoningRatio: null,
      p95LatencyMs: 1200,
      byTag: [['custom', { passed: 1, total: 1 }]],
    },
    error: null,
    warmUp: null,
    runConfig: { temperature: 0 },
    schemaVersion: 2,
    suiteVersion: '0.9.0',
    appVersion: '0.1.0',
    origin: 'local',
    ...overrides,
  };
}

describe('run export envelope', () => {
  it('round-trips losslessly', () => {
    const original = storedRun();
    const { runs, warnings } = decodeRunExport(encodeRunExport([original]));
    expect(warnings).toEqual([]);
    expect(runs).toEqual([original]);
  });

  it('rejects the lossy report-JSON shape with a helpful message', () => {
    const reportJson = JSON.stringify({ generatedAt: 'x', suite: 'local-model-rating', runs: [] });
    expect(() => decodeRunExport(reportJson)).toThrow(/Export runs/);
  });

  it('rejects non-JSON and missing runs array', () => {
    expect(() => decodeRunExport('not json')).toThrow(/Not a JSON file/);
    expect(() => decodeRunExport('{"format":"openbench-run-v1"}')).toThrow(/no runs array/);
  });

  it('drops individually broken runs into warnings instead of failing the file', () => {
    const good = storedRun();
    const bad = { ...storedRun({ runId: 'r2' }), rows: [{ id: 42 }] };
    const { runs, warnings } = decodeRunExport(
      JSON.stringify({ format: 'openbench-run-v1', exportedAt: 'x', appVersion: 'x', runs: [good, bad] }),
    );
    expect(runs).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/run\[1\] skipped/);
  });

  it('throws when EVERY run is invalid', () => {
    const doc = JSON.stringify({ format: 'openbench-run-v1', runs: [{ nope: true }] });
    expect(() => decodeRunExport(doc)).toThrow(/No valid runs/);
  });
});

describe('validateStoredRun', () => {
  it('accepts a full record and pre-v2 records (no schemaVersion)', () => {
    expect(validateStoredRun(storedRun())).toEqual([]);
    const { schemaVersion: _v, suiteVersion: _s, appVersion: _a, origin: _o, ...legacy } = storedRun();
    void _v; void _s; void _a; void _o;
    expect(validateStoredRun(legacy)).toEqual([]);
  });

  it.each([
    ['missing runId', { runId: undefined }],
    ['bad rows', { rows: [{ id: 'x', passed: 'yes' }] }],
    ['bad summary', { summary: { passed: 'many' } }],
    ['missing model', { model: undefined }],
  ])('flags %s', (_name, patch) => {
    const raw = { ...storedRun(), ...(patch as object) };
    expect(validateStoredRun(raw).length).toBeGreaterThan(0);
  });
});

describe('share fragment', () => {
  it('encodes a summary payload into a compact #share=1. fragment and decodes it back', async () => {
    const payload = shareSummaryFromStored(storedRun());
    expect(payload).not.toBeNull();
    if (payload === null) return;
    const fragment = await encodeShareFragment(payload);
    expect(fragment).not.toBeNull();
    if (fragment === null) return;
    expect(hasShareFragment(fragment)).toBe(true);
    expect(fragment.length).toBeLessThan(2000);
    const decoded = await decodeShareFragment(fragment);
    expect(decoded).toEqual(payload);
  });

  it('drops caseResults (not the whole link) when a payload runs long', async () => {
    const manyRows = Array.from({ length: 3000 }, (_, i) => ({
      ...storedRun().rows[0]!,
      id: `case-${i}-${'x'.repeat(40)}`,
    }));
    const payload = shareSummaryFromStored(storedRun({ rows: manyRows }));
    if (payload === null) throw new Error('unexpected null payload');
    const fragment = await encodeShareFragment(payload);
    expect(fragment).not.toBeNull();
    if (fragment === null) return;
    const decoded = await decodeShareFragment(fragment);
    expect(decoded?.caseResults).toBeUndefined();
    expect(decoded?.summary.passed).toBe(1);
  });

  it('returns null on garbage fragments instead of throwing', async () => {
    expect(await decodeShareFragment('#share=1.!!!not-base64!!!')).toBeNull();
    expect(await decodeShareFragment('#other')).toBeNull();
    expect(await decodeShareFragment('#share=1.AAAA')).toBeNull();
  });
});
