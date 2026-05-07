/**
 * Per-model RunConfig overrides for /local-models.
 *
 * Storage shape: localStorage at key `openbench-local:per-model-config`
 * holding a `Record<SelectedKey, Partial<RunConfig>>`. Keys are the
 * canonical `source::id::port` from selection.ts.
 *
 * Precedence (global wins): the universal Setup panel is treated as a
 * top-level override. Per-model settings only apply for fields the
 * global panel leaves unset. So:
 *
 *   effective = { ...perModelOverride, ...globalRunConfig }
 *
 * Example: per-model { temperature: 0.7, maxTokens: 4096 } combined
 * with a global { temperature: 0 } yields { temperature: 0,
 * maxTokens: 4096 } — the global temperature forces every model,
 * the per-model max_tokens still applies because the global panel
 * didn't set it.
 *
 * Rationale: a user running a comparison wants the global panel to
 * be the authoritative "force these for all models" knob. Per-model
 * configs persist as the model's stable defaults; the global panel
 * is the per-run dial that wins when set.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RunConfig } from './bench-direct';
import type { SelectedKey } from './selection';

const STORAGE_KEY = 'openbench-local:per-model-config';

export type PerModelConfigMap = Readonly<Record<SelectedKey, RunConfig>>;

export function usePerModelConfig(): {
  map: PerModelConfigMap;
  get: (key: SelectedKey) => RunConfig | null;
  set: (key: SelectedKey, override: RunConfig) => void;
  clear: (key: SelectedKey) => void;
} {
  const [map, setMap] = useState<PerModelConfigMap>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return;
      setMap(parsed as PerModelConfigMap);
    } catch {
      // corrupt — start clean
    }
  }, []);

  const persist = useCallback((next: PerModelConfigMap) => {
    setMap(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // quota / disabled
    }
  }, []);

  const set = useCallback(
    (key: SelectedKey, override: RunConfig) => {
      // If the override is empty, treat it as "clear" — keeps the
      // map small and avoids surfacing "customised" pills on cards
      // where every field is explicitly default.
      if (isEmpty(override)) {
        persist(without(map, key));
      } else {
        persist({ ...map, [key]: override });
      }
    },
    [map, persist],
  );

  const clear = useCallback(
    (key: SelectedKey) => {
      persist(without(map, key));
    },
    [map, persist],
  );

  const get = useCallback(
    (key: SelectedKey): RunConfig | null => {
      const v = map[key];
      return v === undefined ? null : v;
    },
    [map],
  );

  return { map, get, set, clear };
}

/**
 * Combine global + per-model into the runConfig the runner sees.
 * Global wins — per-model fills only the gaps the global panel
 * left unset. See file header for precedence rationale.
 */
export function mergeRunConfig(global: RunConfig, perModel: RunConfig | null): RunConfig {
  if (perModel === null) return global;
  return { ...perModel, ...global };
}

function isEmpty(c: RunConfig): boolean {
  return Object.keys(c).length === 0;
}

function without(m: PerModelConfigMap, k: SelectedKey): PerModelConfigMap {
  const { [k]: _drop, ...rest } = m;
  void _drop;
  return rest;
}
