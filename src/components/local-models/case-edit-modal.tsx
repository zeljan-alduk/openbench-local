import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { InlineCase } from './builtin-suite';

/**
 * Eval-case editor.
 *
 * Edits the safe subset of `InlineCase` that's reasonable in a form:
 *   - id, input, weight, tags
 *   - evaluator: contains | not_contains | regex | exact | json_schema
 *   - capability gate: tool_use | vision | (none)
 *
 * Tool-call evaluators and image attachments are intentionally NOT
 * editable here — they need richer affordances (JSON schema editor,
 * image upload) and almost nobody hand-authors them. Such cases stay
 * intact when round-tripped via YAML, but the form refuses to overwrite
 * them and shows a hint to "edit via YAML for advanced fields".
 */

type EvalKind = InlineCase['expect']['kind'];
const SIMPLE_KINDS: ReadonlyArray<Exclude<EvalKind, 'tool_call'>> = [
  'contains',
  'not_contains',
  'regex',
  'exact',
  'json_schema',
];

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: 'add' | 'edit';
  readonly initial: InlineCase | null;
  readonly idIsBuiltin: boolean;
  readonly idIsTaken: (id: string) => boolean;
  readonly onSave: (next: InlineCase) => void;
}

export function CaseEditModal({
  open,
  onOpenChange,
  mode,
  initial,
  idIsBuiltin,
  idIsTaken,
  onSave,
}: Props) {
  const [id, setId] = useState('');
  const [input, setInput] = useState('');
  const [weight, setWeight] = useState('1');
  const [tags, setTags] = useState('');
  const [requires, setRequires] = useState<'' | 'tool_use' | 'vision'>('');
  const [evalKind, setEvalKind] = useState<EvalKind>('contains');
  const [evalValue, setEvalValue] = useState('');
  const [evalSchema, setEvalSchema] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [advancedLocked, setAdvancedLocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial === null) {
      // Add mode — empty form with sensible defaults.
      setId('');
      setInput('');
      setWeight('1');
      setTags('custom');
      setRequires('');
      setEvalKind('contains');
      setEvalValue('');
      setEvalSchema('');
      setAdvancedLocked(false);
      return;
    }
    setId(initial.id);
    setInput(initial.input);
    setWeight(String(initial.weight));
    setTags(initial.tags.join(', '));
    setRequires(initial.requires ?? '');
    if (initial.expect.kind === 'tool_call') {
      // Cases with tool-call evaluators or attached images can't be
      // round-tripped through this form — preserve them by locking the
      // advanced fields and only allowing prompt + tags + weight edits.
      setAdvancedLocked(true);
      setEvalKind('contains');
      setEvalValue('');
      setEvalSchema('');
    } else if (initial.expect.kind === 'json_schema') {
      setEvalKind('json_schema');
      setEvalValue('');
      setEvalSchema(JSON.stringify(initial.expect.schema, null, 2));
      setAdvancedLocked(initial.image !== undefined || initial.tools !== undefined);
    } else {
      setEvalKind(initial.expect.kind);
      setEvalValue(initial.expect.value);
      setEvalSchema('');
      setAdvancedLocked(initial.image !== undefined || initial.tools !== undefined);
    }
  }, [open, initial]);

  const onSubmit = () => {
    setError(null);
    const trimmedId = id.trim();
    if (trimmedId === '') {
      setError('id is required.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmedId)) {
      setError('id must be lowercase letters, digits, and dashes (e.g. `my-test-1`).');
      return;
    }
    if (mode === 'add' && idIsTaken(trimmedId)) {
      setError(`A case with id "${trimmedId}" already exists.`);
      return;
    }
    if (mode === 'edit' && initial !== null && trimmedId !== initial.id && idIsBuiltin) {
      setError('Built-in case ids cannot be renamed (they anchor skip / retry).');
      return;
    }
    if (input.trim() === '') {
      setError('input is required.');
      return;
    }
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setError('weight must be a positive number.');
      return;
    }
    let expect: InlineCase['expect'];
    if (advancedLocked && initial !== null) {
      expect = initial.expect;
    } else if (evalKind === 'json_schema') {
      try {
        const schema = JSON.parse(evalSchema);
        expect = { kind: 'json_schema', schema };
      } catch (e) {
        setError(`json_schema: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    } else if (evalKind === 'tool_call') {
      // Editor doesn't author new tool_call cases — simple kinds only.
      setError('tool_call evaluators must be edited via YAML.');
      return;
    } else {
      if (evalValue === '') {
        setError(`Evaluator "${evalKind}" needs a non-empty value.`);
        return;
      }
      expect = { kind: evalKind, value: evalValue };
    }
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const next: InlineCase = {
      id: trimmedId,
      input,
      expect,
      weight: w,
      tags: tagList,
      ...(requires === '' ? {} : { requires }),
      ...(initial?.tools !== undefined && advancedLocked ? { tools: initial.tools } : {}),
      ...(initial?.image !== undefined && advancedLocked ? { image: initial.image } : {}),
    };
    onSave(next);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(720px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-fg">
            {mode === 'add' ? 'Add eval case' : 'Edit eval case'}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-fg-muted">
            Saved to your browser. Custom cases run alongside the built-in suite, in the order
            shown in the panel below.
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-4 text-sm">
            <Field
              label="id"
              hint="lowercase, dashes; stable across edits — used for skip & retry"
            >
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={mode === 'edit' && idIsBuiltin}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg disabled:opacity-60"
                placeholder="my-test"
              />
            </Field>

            <Field label="prompt (input)" hint="exactly what the model receives">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-[13px] text-fg"
                placeholder="Reply with PASS."
              />
            </Field>

            {advancedLocked ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                This case uses an advanced evaluator (tool-call) or attachment (image). Edit those
                fields by exporting to YAML and re-importing.
              </div>
            ) : (
              <>
                <Field label="evaluator">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <select
                      value={evalKind}
                      onChange={(e) => setEvalKind(e.target.value as EvalKind)}
                      className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg sm:w-44"
                    >
                      {SIMPLE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    {evalKind === 'json_schema' ? (
                      <textarea
                        value={evalSchema}
                        onChange={(e) => setEvalSchema(e.target.value)}
                        rows={6}
                        className="w-full flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] text-fg"
                        placeholder='{"type":"object","required":["x"],"properties":{"x":{"type":"number"}}}'
                      />
                    ) : (
                      <input
                        type="text"
                        value={evalValue}
                        onChange={(e) => setEvalValue(e.target.value)}
                        className="w-full flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
                        placeholder={evalKind === 'regex' ? '^PASS$' : 'PASS'}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-fg-muted">
                    {evalKindHint(evalKind)}
                  </p>
                </Field>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="weight">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
                />
              </Field>
              <Field label="tags" hint="comma-separated">
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
                  placeholder="reasoning, fast"
                />
              </Field>
              <Field label="requires capability">
                <select
                  value={requires}
                  onChange={(e) => setRequires(e.target.value as '' | 'tool_use' | 'vision')}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
                >
                  <option value="">(none)</option>
                  <option value="tool_use">tool_use</option>
                  <option value="vision">vision</option>
                </select>
              </Field>
            </div>

            {error !== null ? (
              <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:shadow-md"
            >
              {mode === 'add' ? 'Add case' : 'Save changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
        {label}
      </span>
      {children}
      {hint !== undefined ? <span className="text-[11px] text-fg-faint">{hint}</span> : null}
    </label>
  );
}

function evalKindHint(kind: EvalKind): string {
  switch (kind) {
    case 'contains':
      return 'Pass when the output contains the value as a substring (case-sensitive).';
    case 'not_contains':
      return 'Pass when the output does NOT contain the value (useful for safety / prompt-leak checks).';
    case 'regex':
      return 'JavaScript regex source — applied with the default `.test()` semantics.';
    case 'exact':
      return 'Pass when the trimmed output equals the value exactly.';
    case 'json_schema':
      return 'Output is parsed as JSON and validated against this schema (subset of JSON Schema draft-7).';
    case 'tool_call':
      return 'tool_call cases must be authored via YAML.';
  }
}
