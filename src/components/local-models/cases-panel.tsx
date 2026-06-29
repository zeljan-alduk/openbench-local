import * as Switch from '@radix-ui/react-switch';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InlineCase } from './builtin-suite';
import { CaseEditModal } from './case-edit-modal';
import { isParameterized } from './case-generate';
import { type CaseSource, useCaseStore } from './case-store';
import { decodeCasesYaml, encodeCasesYaml } from './cases-yaml';

/**
 * Eval-cases panel.
 *
 * Sits between the Setup section and the Run rating section. Lists
 * every case the runner will execute (built-in + user edits + custom),
 * lets the user edit any of them, hide builtins, add new cases, and
 * round-trip the whole list through a YAML file for sharing.
 */

interface Props {
  readonly disabled: boolean;
  readonly store: ReturnType<typeof useCaseStore>;
}

export function CasesPanel({ disabled, store }: Props) {
  const {
    effective,
    viewableEffective,
    tagAtoms,
    tagFilter,
    toggleTag,
    clearTagFilter,
    applyTagFilterToRun,
    setApplyTagFilterToRun,
    isBuiltin,
    upsertCase,
    deleteCase,
    resetCase,
    resetAll,
    appendCustom,
    setEnabled,
    setEnabledMany,
    moveCase,
    duplicateCase,
    allCasesForExport,
  } = store;
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState(true);

  // Auto-collapse when a run starts so the Eval-cases section gets
  // out of the way of live results. The user can re-expand mid-run
  // if they want to inspect cases — we don't lock the toggle.
  useEffect(() => {
    if (disabled) setCollapsed(true);
  }, [disabled]);
  const [editing, setEditing] = useState<{ mode: 'add' | 'edit'; initial: InlineCase | null }>({
    mode: 'add',
    initial: null,
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Drag-and-drop reorder. Only the dragged id is held in React
  // state; the drop target is computed from the dragover event so
  // reordering is responsive without a re-render per pointer move.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropOverId, setDropOverId] = useState<string | null>(null);

  const onAdd = () => {
    setEditing({ mode: 'add', initial: null });
    setEditorOpen(true);
  };
  const onEdit = (c: InlineCase) => {
    setEditing({ mode: 'edit', initial: c });
    setEditorOpen(true);
  };

  const idIsTaken = (id: string) => effective.some((e) => e.case.id === id);

  const onDuplicate = (c: InlineCase) => {
    const newId = duplicateCase(c);
    // Open the editor on the freshly-inserted copy so the user can
    // rename + tweak before the next run reads it.
    const copy: InlineCase = { ...c, id: newId };
    setEditing({ mode: 'edit', initial: copy });
    setEditorOpen(true);
  };

  // Search / filter. Empty query → use the tag-filtered set straight
  // from the store. Non-empty query → AND a substring match against
  // id / evaluator kind / tags / prompt body on top of the tag set.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q === '') return viewableEffective;
    return viewableEffective.filter(({ case: c }) => {
      if (c.id.toLowerCase().includes(q)) return true;
      if (c.expect.kind.toLowerCase() === q) return true;
      if (c.expect.kind.toLowerCase().includes(q)) return true;
      if (c.tags.some((t) => t.toLowerCase().includes(q))) return true;
      if (c.input.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [viewableEffective, filter]);

  const onBulkEnableVisible = (on: boolean) => {
    const ids = filtered.map((e) => e.case.id);
    setEnabledMany(ids, on);
  };

  const onExport = () => {
    const yaml = encodeCasesYaml(allCasesForExport);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `openbench-local-cases-${stamp}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPickFile = () => {
    setImportError(null);
    fileRef.current?.click();
  };

  const onFileChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (file === undefined) return;
    try {
      const text = await file.text();
      const cases = decodeCasesYaml(text);
      appendCustom(cases);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-bg-elevated shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Eval cases
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg">
            {store.effectiveCases.length} of {effective.length} case
            {effective.length === 1 ? '' : 's'} will run
            {applyTagFilterToRun && tagFilter.size > 0 ? (
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                category filter on
              </span>
            ) : null}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
            Built-in cases ship by default. Edit any of them, hide the ones you don't care about,
            or add your own — saved to your browser, exportable as YAML. Group with categories
            below to focus on a single capability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Add case
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={disabled}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
            title="Download every case as a portable YAML file"
          >
            Export YAML
          </button>
          <button
            type="button"
            onClick={onPickFile}
            disabled={disabled}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
            title="Import cases from a YAML file (appended to your current set)"
          >
            Import YAML
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml"
            className="hidden"
            onChange={(ev) => {
              void onFileChosen(ev);
            }}
          />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </header>

      {importError !== null ? (
        <div className="border-b border-danger/30 bg-danger/5 px-5 py-2 text-xs text-danger">
          Import failed: {importError}
        </div>
      ) : null}

      {!collapsed ? (
        <div className="px-5 py-5">
          {tagAtoms.length > 0 ? (
            <TagFilterRow
              tagAtoms={tagAtoms}
              tagFilter={tagFilter}
              onToggleTag={toggleTag}
              onClear={clearTagFilter}
              applyToRun={applyTagFilterToRun}
              onApplyToRunChange={setApplyTagFilterToRun}
              visibleCount={filtered.length}
              totalCount={effective.length}
            />
          ) : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[14rem]">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search id, tag, evaluator, or prompt…"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 pl-8 text-sm text-fg placeholder:text-fg-faint"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint"
              >
                ⌕
              </span>
            </div>
            {filter !== '' ? (
              <span className="font-mono text-[11px] text-fg-muted">
                {filtered.length}/{effective.length}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onBulkEnableVisible(true)}
              disabled={disabled || filtered.length === 0}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
              title={filter !== '' ? 'Enable every case the search matches' : 'Enable every case'}
            >
              Enable {filter !== '' ? 'visible' : 'all'}
            </button>
            <button
              type="button"
              onClick={() => onBulkEnableVisible(false)}
              disabled={disabled || filtered.length === 0}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
              title={
                filter !== '' ? 'Disable every case the search matches' : 'Disable every case'
              }
            >
              Disable {filter !== '' ? 'visible' : 'all'}
            </button>
          </div>
          <ul
            className="flex flex-col gap-1.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              setDraggingId(null);
              setDropOverId(null);
            }}
          >
            {filtered.map(({ case: c, source, enabled }) => (
              <CaseRow
                key={c.id}
                c={c}
                source={source}
                enabled={enabled}
                disabled={disabled}
                isDragging={draggingId === c.id}
                isDropTarget={dropOverId === c.id && draggingId !== null && draggingId !== c.id}
                tagFilter={tagFilter}
                onTagClick={(t) => toggleTag(t)}
                onEdit={() => onEdit(c)}
                onDuplicate={() => onDuplicate(c)}
                onDelete={() => deleteCase(c.id)}
                onReset={isBuiltin(c.id) ? () => resetCase(c.id) : null}
                onToggleEnabled={(on) => setEnabled(c.id, on)}
                onDragStart={(ev) => {
                  setDraggingId(c.id);
                  ev.dataTransfer.effectAllowed = 'move';
                  ev.dataTransfer.setData('text/plain', c.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropOverId(null);
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = 'move';
                  if (draggingId !== null && draggingId !== c.id) setDropOverId(c.id);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const fromId = ev.dataTransfer.getData('text/plain') || draggingId;
                  setDraggingId(null);
                  setDropOverId(null);
                  if (fromId !== null && fromId !== '' && fromId !== c.id) {
                    moveCase(fromId, c.id);
                  }
                }}
              />
            ))}
            {filtered.length === 0 ? (
              <p className="text-sm text-fg-muted">
                {effective.length === 0
                  ? 'No cases. Press “Add case” or “Reset all” to restore the built-in suite.'
                  : `No cases match "${filter}".`}
              </p>
            ) : null}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-[11px] text-fg-faint">
              Built-in cases ship at version 0.3.0. Edits are stored in your browser; nothing is
              uploaded.
            </p>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset all cases to the built-in defaults? Your custom cases and edits will be removed.',
                  )
                ) {
                  resetAll();
                }
              }}
              disabled={disabled}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
            >
              Reset all
            </button>
          </div>
        </div>
      ) : null}

      <CaseEditModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editing.mode}
        initial={editing.initial}
        idIsBuiltin={editing.initial !== null && isBuiltin(editing.initial.id)}
        idIsTaken={(id) =>
          editing.mode === 'add' ? idIsTaken(id) : id !== editing.initial?.id && idIsTaken(id)
        }
        onSave={(next) => upsertCase(next, editing.initial?.id)}
      />
    </section>
  );
}

interface CaseRowProps {
  readonly c: InlineCase;
  readonly source: CaseSource;
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly tagFilter: ReadonlySet<string>;
  readonly onTagClick: (tag: string) => void;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onReset: (() => void) | null;
  readonly onToggleEnabled: (on: boolean) => void;
  readonly onDragStart: (ev: React.DragEvent<HTMLLIElement>) => void;
  readonly onDragEnd: (ev: React.DragEvent<HTMLLIElement>) => void;
  readonly onDragOver: (ev: React.DragEvent<HTMLLIElement>) => void;
  readonly onDrop: (ev: React.DragEvent<HTMLLIElement>) => void;
}

function CaseRow({
  c,
  source,
  enabled,
  disabled,
  isDragging,
  isDropTarget,
  tagFilter,
  onTagClick,
  onEdit,
  onDuplicate,
  onDelete,
  onReset,
  onToggleEnabled,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: CaseRowProps) {
  const preview = c.input.replace(/\s+/g, ' ').slice(0, 90);
  return (
    <li
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'flex flex-col gap-2 rounded-lg border bg-bg px-3 py-2 text-sm sm:flex-row sm:items-center',
        isDropTarget ? 'border-accent ring-1 ring-accent/40' : 'border-border',
        isDragging ? 'opacity-50' : '',
        !enabled ? 'bg-bg-subtle/40' : '',
      ].join(' ')}
    >
      <span
        aria-hidden
        title="Drag to reorder"
        className="hidden cursor-grab select-none text-fg-faint hover:text-fg sm:inline-block"
      >
        ⋮⋮
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-1 ${enabled ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
            {c.id}
          </code>
          <SourceBadge source={source} />
          <span className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            {c.expect.kind}
          </span>
          {c.requires !== undefined ? (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              needs {c.requires}
            </span>
          ) : null}
          {isParameterized(c) ? (
            <span
              className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
              title="Parameterized — re-randomized each run to resist memorization. Authorable via the generate block in exported YAML."
            >
              ⚙ param
            </span>
          ) : null}
          {c.tags.map((t) => {
            const active = tagFilter.has(t);
            return (
              <button
                type="button"
                key={t}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(t);
                }}
                className={[
                  'rounded-full border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                  active
                    ? 'border-accent/60 bg-accent/15 text-accent'
                    : 'border-transparent text-fg-faint hover:border-border hover:bg-bg-subtle hover:text-fg-muted',
                ].join(' ')}
                title={active ? `Remove "${t}" from filter` : `Filter to "${t}"`}
              >
                #{t}
              </button>
            );
          })}
        </div>
        <p className="truncate text-[12px] text-fg-muted" title={c.input}>
          {preview}
          {c.input.length > 90 ? '…' : ''}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Switch.Root
          checked={enabled}
          onCheckedChange={onToggleEnabled}
          disabled={disabled}
          title={enabled ? 'Enabled — included in runs' : 'Disabled — skipped at run time'}
          className="relative h-5 w-9 rounded-full border border-border bg-bg-subtle outline-none transition-colors data-[state=checked]:bg-accent data-[disabled]:opacity-50"
        >
          <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-bg-elevated shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={disabled}
          title="Duplicate this case as a new custom"
          className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
        >
          Duplicate
        </button>
        {onReset !== null ? (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled || source === 'builtin'}
            className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-40"
            title="Restore the built-in default"
          >
            Reset
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            title="Delete this custom case"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Tag chip filter row. Shows every tag observed on the currently
 * effective cases as a togglable chip. Selected chips union — a case
 * is visible if it carries at least one selected tag. Below the
 * chips, an "Apply to run" toggle lets the user opt in to passing
 * the filtered subset to the runner instead of the full enabled set.
 */
function TagFilterRow({
  tagAtoms,
  tagFilter,
  onToggleTag,
  onClear,
  applyToRun,
  onApplyToRunChange,
  visibleCount,
  totalCount,
}: {
  tagAtoms: readonly { readonly tag: string; readonly count: number }[];
  tagFilter: ReadonlySet<string>;
  onToggleTag: (tag: string) => void;
  onClear: () => void;
  applyToRun: boolean;
  onApplyToRunChange: (on: boolean) => void;
  visibleCount: number;
  totalCount: number;
}) {
  const active = tagFilter.size > 0;
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-bg/50 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          Categories
        </p>
        <span className="font-mono text-[10px] text-fg-faint">
          {active ? `${visibleCount}/${totalCount} visible` : `${tagAtoms.length} tags`}
        </span>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded border border-border bg-bg px-2 py-0.5 font-mono text-[10px] text-fg-muted hover:border-accent hover:text-accent"
            title="Clear category filter"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {tagAtoms.map(({ tag, count }) => {
          const on = tagFilter.has(tag);
          return (
            <button
              type="button"
              key={tag}
              onClick={() => onToggleTag(tag)}
              className={[
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors',
                on
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-border bg-bg text-fg-muted hover:border-accent/40 hover:text-fg',
              ].join(' ')}
              title={on ? `Remove "${tag}" from filter` : `Add "${tag}" to filter`}
            >
              <span>#{tag}</span>
              <span className="font-mono text-[9px] text-fg-faint">{count}</span>
            </button>
          );
        })}
      </div>
      <label
        className={[
          'flex select-none items-center gap-2 text-[11px]',
          active ? 'text-fg' : 'text-fg-faint',
        ].join(' ')}
        title={
          active
            ? 'Run only the cases matching the active filter'
            : 'Pick at least one tag to enable run filtering'
        }
      >
        <input
          type="checkbox"
          checked={applyToRun}
          onChange={(e) => onApplyToRunChange(e.target.checked)}
          disabled={!active}
          className="h-3.5 w-3.5 accent-accent"
        />
        Apply category filter to run
        {applyToRun && active ? (
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
            on
          </span>
        ) : null}
      </label>
    </div>
  );
}

function SourceBadge({ source }: { source: CaseSource }) {
  const map: Record<CaseSource, { label: string; tone: string }> = {
    builtin: { label: 'built-in', tone: 'bg-bg-subtle text-fg-muted' },
    edited: {
      label: 'edited',
      tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    },
    custom: { label: 'custom', tone: 'bg-accent/15 text-accent' },
  };
  const { label, tone } = map[source];
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}
