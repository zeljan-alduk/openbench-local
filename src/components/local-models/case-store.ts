import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InlineCase, LOCAL_MODEL_RATING_SUITE } from './builtin-suite';

/**
 * Persistent eval-case store.
 *
 * The 18 builtin cases ship as the default. The user can:
 *   - edit any builtin in place (override stored under the same id)
 *   - hide a builtin (drops out of the run, restorable via "reset")
 *   - add brand-new custom cases
 *
 * The "effective" case list returned by `useCaseStore` is what the
 * benchmark runner consumes. It composes builtins + user mutations
 * deterministically:
 *
 *   for each builtin in source order:
 *     if hidden — skip
 *     else if overridden — emit override
 *     else — emit builtin
 *   then append all `custom` in user-defined order
 *
 * Persistence: localStorage `openbench-local:cases`. The store version
 * is stamped so future schema changes can migrate forward without
 * silently corrupting older data.
 */

const STORAGE_KEY = 'openbench-local:cases';
const STORE_VERSION = 1;

interface PersistedState {
  readonly version: number;
  readonly overrides: Readonly<Record<string, InlineCase>>;
  readonly hidden: readonly string[];
  readonly custom: readonly InlineCase[];
}

const EMPTY_STATE: PersistedState = {
  version: STORE_VERSION,
  overrides: {},
  hidden: [],
  custom: [],
};

export type CaseSource = 'builtin' | 'edited' | 'custom';

export interface EffectiveCase {
  readonly case: InlineCase;
  readonly source: CaseSource;
}

function loadState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== STORE_VERSION) return EMPTY_STATE;
    return {
      version: STORE_VERSION,
      overrides: parsed.overrides ?? {},
      hidden: parsed.hidden ?? [],
      custom: parsed.custom ?? [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(s: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — keep the in-memory copy and hope for the best. */
  }
}

export function useCaseStore() {
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: PersistedState) => {
    setState(next);
    saveState(next);
  }, []);

  const effective = useMemo<readonly EffectiveCase[]>(() => {
    const out: EffectiveCase[] = [];
    const hiddenSet = new Set(state.hidden);
    for (const b of LOCAL_MODEL_RATING_SUITE.cases) {
      if (hiddenSet.has(b.id)) continue;
      const override = state.overrides[b.id];
      if (override !== undefined) {
        out.push({ case: override, source: 'edited' });
      } else {
        out.push({ case: b, source: 'builtin' });
      }
    }
    for (const c of state.custom) {
      out.push({ case: c, source: 'custom' });
    }
    return out;
  }, [state]);

  /** True when the case id matches a builtin (so editing creates an override). */
  const isBuiltin = useCallback(
    (id: string) => LOCAL_MODEL_RATING_SUITE.cases.some((c) => c.id === id),
    [],
  );

  const upsertCase = useCallback(
    (next: InlineCase, originalId?: string) => {
      const targetId = originalId ?? next.id;
      const targetIsBuiltin = isBuiltin(targetId);
      if (targetIsBuiltin) {
        // Editing a builtin: stash under overrides keyed by builtin id.
        // Renaming a builtin is intentionally rejected — the id is the
        // stable handle the runner uses for skip/retry.
        const overrides = { ...state.overrides, [targetId]: { ...next, id: targetId } };
        persist({ ...state, overrides });
        return;
      }
      // Custom case: replace by id, otherwise append.
      const idx = state.custom.findIndex((c) => c.id === targetId);
      if (idx >= 0) {
        const custom = [...state.custom];
        custom[idx] = next;
        persist({ ...state, custom });
      } else {
        persist({ ...state, custom: [...state.custom, next] });
      }
    },
    [state, persist, isBuiltin],
  );

  const deleteCase = useCallback(
    (id: string) => {
      if (isBuiltin(id)) {
        // Builtins are hidden, not deleted — preserves the option to
        // restore via "reset" without re-shipping the source object.
        const overrides = { ...state.overrides };
        delete overrides[id];
        const hidden = state.hidden.includes(id) ? state.hidden : [...state.hidden, id];
        persist({ ...state, overrides, hidden });
        return;
      }
      persist({ ...state, custom: state.custom.filter((c) => c.id !== id) });
    },
    [state, persist, isBuiltin],
  );

  const resetCase = useCallback(
    (id: string) => {
      // Drops any override + un-hides the id. Custom cases ignore this
      // (they have no "default" to revert to — use deleteCase).
      if (!isBuiltin(id)) return;
      const overrides = { ...state.overrides };
      delete overrides[id];
      const hidden = state.hidden.filter((h) => h !== id);
      persist({ ...state, overrides, hidden });
    },
    [state, persist, isBuiltin],
  );

  const resetAll = useCallback(() => {
    persist(EMPTY_STATE);
  }, [persist]);

  /** Replace `custom` and clear all overrides — used by YAML import. */
  const replaceAllWithCustom = useCallback(
    (cases: readonly InlineCase[]) => {
      persist({ version: STORE_VERSION, overrides: {}, hidden: [], custom: [...cases] });
    },
    [persist],
  );

  /** Append imported cases on top of the existing state. */
  const appendCustom = useCallback(
    (cases: readonly InlineCase[]) => {
      // Dedupe by id — incoming cases win, replacing any same-id custom
      // we already have. Builtins keep their position; if a builtin id
      // collides, we treat it as an override (consistent with editing).
      const customById = new Map(state.custom.map((c) => [c.id, c]));
      const overrides = { ...state.overrides };
      for (const c of cases) {
        if (isBuiltin(c.id)) {
          overrides[c.id] = { ...c, id: c.id };
        } else {
          customById.set(c.id, c);
        }
      }
      persist({ ...state, overrides, custom: [...customById.values()] });
    },
    [state, persist, isBuiltin],
  );

  return {
    hydrated,
    effective,
    /** Snapshot for export — same order as the runner sees. */
    effectiveCases: effective.map((e) => e.case),
    state,
    isBuiltin,
    upsertCase,
    deleteCase,
    resetCase,
    resetAll,
    replaceAllWithCustom,
    appendCustom,
  };
}
