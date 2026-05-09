import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InlineCase, LOCAL_MODEL_RATING_SUITE } from './builtin-suite';

/**
 * Persistent eval-case store.
 *
 * The 18 builtin cases ship as the default. The user can:
 *   - edit any builtin in place (override stored under the same id)
 *   - disable a case (built-in or custom) so it's skipped at run time
 *     but still visible in the panel for one-click re-enable
 *   - reorder the runtime sequence (drag-and-drop on the panel)
 *   - add brand-new custom cases
 *
 * The "effective" list returned by `useCaseStore.effective` is the
 * panel's view — every case the user knows about, in the user's
 * order, annotated with source + enabled flag. The runner consumes
 * `effectiveCases`, which filters out disabled rows and preserves the
 * order.
 *
 * Persistence: localStorage `openbench-local:cases`. STORE_VERSION
 * stamps the on-disk shape so future schema changes can migrate
 * forward without silently corrupting older data; v1 (with `hidden`)
 * is auto-migrated to v2 (with `disabled` + `order`) on first load.
 */

const STORAGE_KEY = 'openbench-local:cases';
const STORE_VERSION = 2;
// Tag filter persistence is independent of the cases blob — the
// active filter is a UI preference, not part of the case data.
const TAG_FILTER_KEY = 'openbench-local:cases:tag-filter';
const TAG_FILTER_APPLY_KEY = 'openbench-local:cases:tag-filter-apply-to-run';

interface PersistedState {
  readonly version: number;
  readonly overrides: Readonly<Record<string, InlineCase>>;
  /** Case ids the user has switched off — present in the panel, skipped by the runner. */
  readonly disabled: readonly string[];
  readonly custom: readonly InlineCase[];
  /** Explicit run-time ordering. Empty means "use natural order". */
  readonly order: readonly string[];
}

const EMPTY_STATE: PersistedState = {
  version: STORE_VERSION,
  overrides: {},
  disabled: [],
  custom: [],
  order: [],
};

export type CaseSource = 'builtin' | 'edited' | 'custom';

export interface EffectiveCase {
  readonly case: InlineCase;
  readonly source: CaseSource;
  readonly enabled: boolean;
}

interface PersistedV1Compat extends Partial<PersistedState> {
  readonly hidden?: readonly string[];
}

function loadState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as PersistedV1Compat;
    // v1 → v2 migration: `hidden` was the rough equivalent of v2's
    // `disabled`. We preserve the user's intent across the rename.
    const disabled = parsed.disabled ?? parsed.hidden ?? [];
    return {
      version: STORE_VERSION,
      overrides: parsed.overrides ?? {},
      disabled,
      custom: parsed.custom ?? [],
      order: parsed.order ?? [],
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

function loadTagFilter(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(TAG_FILTER_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveTagFilter(s: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(TAG_FILTER_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function loadApplyToRun(): boolean {
  try {
    return window.localStorage.getItem(TAG_FILTER_APPLY_KEY) === '1';
  } catch {
    return false;
  }
}

function saveApplyToRun(on: boolean): void {
  try {
    window.localStorage.setItem(TAG_FILTER_APPLY_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function useCaseStore() {
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  // Tag filter (set of selected atoms) and the "apply to run" toggle.
  // Default: nothing filtered, view-only behaviour. Persisted in
  // localStorage independently of the cases blob so the user keeps
  // their last category view across reloads.
  const [tagFilter, setTagFilterState] = useState<ReadonlySet<string>>(new Set());
  const [applyTagFilterToRun, setApplyToRunState] = useState<boolean>(false);

  useEffect(() => {
    setState(loadState());
    setTagFilterState(loadTagFilter());
    setApplyToRunState(loadApplyToRun());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: PersistedState) => {
    setState(next);
    saveState(next);
  }, []);

  /** Natural order: builtins (in source order) followed by customs (in append order). */
  const naturalOrder = useMemo<readonly EffectiveCase[]>(() => {
    const out: EffectiveCase[] = [];
    const disabledSet = new Set(state.disabled);
    for (const b of LOCAL_MODEL_RATING_SUITE.cases) {
      const override = state.overrides[b.id];
      out.push({
        case: override ?? b,
        source: override !== undefined ? 'edited' : 'builtin',
        enabled: !disabledSet.has(b.id),
      });
    }
    for (const c of state.custom) {
      out.push({
        case: c,
        source: 'custom',
        enabled: !disabledSet.has(c.id),
      });
    }
    return out;
  }, [state]);

  /**
   * Effective list = natural order resequenced by `state.order` (when
   * non-empty). Cases not in `order` keep their natural position
   * relative to other not-in-order cases and trail those that are.
   */
  const effective = useMemo<readonly EffectiveCase[]>(() => {
    if (state.order.length === 0) return naturalOrder;
    const byId = new Map(naturalOrder.map((e) => [e.case.id, e]));
    const seen = new Set<string>();
    const head: EffectiveCase[] = [];
    for (const id of state.order) {
      const e = byId.get(id);
      if (e === undefined) continue;
      head.push(e);
      seen.add(id);
    }
    const tail = naturalOrder.filter((e) => !seen.has(e.case.id));
    return [...head, ...tail];
  }, [naturalOrder, state.order]);

  const isBuiltin = useCallback(
    (id: string) => LOCAL_MODEL_RATING_SUITE.cases.some((c) => c.id === id),
    [],
  );

  const upsertCase = useCallback(
    (next: InlineCase, originalId?: string) => {
      const targetId = originalId ?? next.id;
      const targetIsBuiltin = isBuiltin(targetId);
      if (targetIsBuiltin) {
        const overrides = { ...state.overrides, [targetId]: { ...next, id: targetId } };
        persist({ ...state, overrides });
        return;
      }
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

  /**
   * Custom cases are physically removed; built-ins are disabled
   * (so they can be re-enabled with one click instead of re-shipped).
   */
  const deleteCase = useCallback(
    (id: string) => {
      if (isBuiltin(id)) {
        const disabled = state.disabled.includes(id) ? state.disabled : [...state.disabled, id];
        const overrides = { ...state.overrides };
        delete overrides[id];
        persist({ ...state, overrides, disabled });
        return;
      }
      // Removing a custom case also drops it from disabled / order so
      // its id can be reused by a future case without surprises.
      persist({
        ...state,
        custom: state.custom.filter((c) => c.id !== id),
        disabled: state.disabled.filter((d) => d !== id),
        order: state.order.filter((o) => o !== id),
      });
    },
    [state, persist, isBuiltin],
  );

  const setEnabled = useCallback(
    (id: string, on: boolean) => {
      const has = state.disabled.includes(id);
      if (on === !has) return;
      const disabled = on ? state.disabled.filter((d) => d !== id) : [...state.disabled, id];
      persist({ ...state, disabled });
    },
    [state, persist],
  );

  const resetCase = useCallback(
    (id: string) => {
      if (!isBuiltin(id)) return;
      const overrides = { ...state.overrides };
      delete overrides[id];
      const disabled = state.disabled.filter((d) => d !== id);
      persist({ ...state, overrides, disabled });
    },
    [state, persist, isBuiltin],
  );

  const resetAll = useCallback(() => {
    persist(EMPTY_STATE);
  }, [persist]);

  /**
   * Reorder the case list. `fromId` is the id being dragged;
   * `toId` is the id it's being dropped above. Updates `state.order`
   * to reflect the new sequence; cases not currently in `order`
   * are folded in based on their natural position before the move.
   */
  const moveCase = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      // Materialise the current effective ID sequence so we can
      // splice in/out without re-deriving on every render.
      const ids = effective.map((e) => e.case.id);
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const reordered = [...ids];
      reordered.splice(fromIdx, 1);
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
      reordered.splice(insertAt, 0, fromId);
      persist({ ...state, order: reordered });
    },
    [state, persist, effective],
  );

  const replaceAllWithCustom = useCallback(
    (cases: readonly InlineCase[]) => {
      persist({
        version: STORE_VERSION,
        overrides: {},
        disabled: [],
        custom: [...cases],
        order: [],
      });
    },
    [persist],
  );

  const appendCustom = useCallback(
    (cases: readonly InlineCase[]) => {
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

  /**
   * Mint a unique id to seed a "Duplicate" action. Appends `-copy`,
   * then `-copy-2`, `-copy-3` … until we find one not in use.
   */
  const mintCopyId = useCallback(
    (sourceId: string): string => {
      const base = sourceId.replace(/-copy(?:-\d+)?$/, '');
      const taken = new Set([
        ...LOCAL_MODEL_RATING_SUITE.cases.map((c) => c.id),
        ...state.custom.map((c) => c.id),
      ]);
      const first = `${base}-copy`;
      if (!taken.has(first)) return first;
      for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-copy-${i}`;
        if (!taken.has(candidate)) return candidate;
      }
      // Practically unreachable.
      return `${base}-copy-${Date.now()}`;
    },
    [state.custom],
  );

  /**
   * Insert a copy of an existing case as a new custom case. Returns
   * the new id so the caller can immediately open the editor on it.
   */
  const duplicateCase = useCallback(
    (source: InlineCase): string => {
      const newId = mintCopyId(source.id);
      const copy: InlineCase = { ...source, id: newId };
      persist({ ...state, custom: [...state.custom, copy] });
      return newId;
    },
    [state, persist, mintCopyId],
  );

  /** Bulk-toggle a list of ids — used by the "enable/disable visible" buttons. */
  const setEnabledMany = useCallback(
    (ids: readonly string[], on: boolean) => {
      if (ids.length === 0) return;
      const next = new Set(state.disabled);
      for (const id of ids) {
        if (on) next.delete(id);
        else next.add(id);
      }
      persist({ ...state, disabled: [...next] });
    },
    [state, persist],
  );

  // Tag filter setters with persistence side-effects baked in.
  const setTagFilter = useCallback((next: ReadonlySet<string>) => {
    setTagFilterState(next);
    saveTagFilter(next);
  }, []);
  const toggleTag = useCallback(
    (tag: string) => {
      const next = new Set(tagFilter);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      setTagFilter(next);
    },
    [tagFilter, setTagFilter],
  );
  const clearTagFilter = useCallback(() => {
    setTagFilter(new Set());
  }, [setTagFilter]);
  const setApplyTagFilterToRun = useCallback((on: boolean) => {
    setApplyToRunState(on);
    saveApplyToRun(on);
  }, []);

  // Tag → case count, computed from the currently effective cases
  // (excluding disabled rows so the count reflects what would
  // actually run if the user toggled "apply to run"). Sorted by count
  // descending then alphabetically so the chip row is stable.
  const tagAtoms = useMemo<readonly { readonly tag: string; readonly count: number }[]>(() => {
    const counts = new Map<string, number>();
    for (const e of effective) {
      if (!e.enabled) continue;
      for (const t of e.case.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [effective]);

  // Cases the panel should display: effective ∩ tag filter (when any
  // tag is active). Empty filter = show all.
  const viewableEffective = useMemo<readonly EffectiveCase[]>(() => {
    if (tagFilter.size === 0) return effective;
    return effective.filter((e) => e.case.tags.some((t) => tagFilter.has(t)));
  }, [effective, tagFilter]);

  // Cases the runner should execute. When the user has explicitly
  // opted in to "Apply category filter to run", we run only the
  // tag-filtered enabled set. Otherwise the runner sees every enabled
  // case (existing behaviour). Naturally deduped because we filter
  // directly off the effective list — each id appears once even if it
  // matches multiple selected tags.
  const runnableCases = useMemo(() => {
    const base = effective.filter((e) => e.enabled);
    if (!applyTagFilterToRun || tagFilter.size === 0) {
      return base.map((e) => e.case);
    }
    return base
      .filter((e) => e.case.tags.some((t) => tagFilter.has(t)))
      .map((e) => e.case);
  }, [effective, tagFilter, applyTagFilterToRun]);

  return {
    hydrated,
    effective,
    /** Effective list intersected with the active tag filter — drives the panel display. */
    viewableEffective,
    /** Tag atoms with counts, sorted for stable chip rendering. */
    tagAtoms,
    tagFilter,
    setTagFilter,
    toggleTag,
    clearTagFilter,
    applyTagFilterToRun,
    setApplyTagFilterToRun,
    /** Snapshot for the runner — enabled cases, optionally tag-filtered. */
    effectiveCases: runnableCases,
    /** Snapshot for export — all cases, regardless of enabled state. */
    allCasesForExport: effective.map((e) => e.case),
    state,
    isBuiltin,
    upsertCase,
    deleteCase,
    resetCase,
    resetAll,
    setEnabled,
    setEnabledMany,
    moveCase,
    duplicateCase,
    replaceAllWithCustom,
    appendCustom,
  };
}
