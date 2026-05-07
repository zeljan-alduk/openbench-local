import * as Switch from '@radix-ui/react-switch';
import { useRef, useState } from 'react';
import type { InlineCase } from './builtin-suite';
import { CaseEditModal } from './case-edit-modal';
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
    isBuiltin,
    upsertCase,
    deleteCase,
    resetCase,
    resetAll,
    appendCustom,
    setEnabled,
    moveCase,
    allCasesForExport,
  } = store;
  const [collapsed, setCollapsed] = useState(true);
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
            {effective.filter((e) => e.enabled).length} of {effective.length} case
            {effective.length === 1 ? '' : 's'} will run
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
            Built-in cases ship by default. Edit any of them, hide the ones you don't care about,
            or add your own — saved to your browser, exportable as YAML.
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
          <ul
            className="flex flex-col gap-1.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              setDraggingId(null);
              setDropOverId(null);
            }}
          >
            {effective.map(({ case: c, source, enabled }) => (
              <CaseRow
                key={c.id}
                c={c}
                source={source}
                enabled={enabled}
                disabled={disabled}
                isDragging={draggingId === c.id}
                isDropTarget={dropOverId === c.id && draggingId !== null && draggingId !== c.id}
                onEdit={() => onEdit(c)}
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
            {effective.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No cases. Press <em>Add case</em> or <em>Reset all</em> to restore the built-in
                suite.
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
  readonly onEdit: () => void;
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
  onEdit,
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
          {c.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] text-fg-faint">
              #{t}
            </span>
          ))}
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
