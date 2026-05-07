import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import type { InlineCase } from './builtin-suite';
import { evaluateOutput } from './evaluator-direct';

/**
 * Eval-case editor.
 *
 * Form layout:
 *   - Left pane: editable fields (id, prompt, evaluator, weight, tags,
 *     capability gate).
 *   - Right pane: live preview — a render of how the case will appear
 *     in the cases list, plus a "Try it" sandbox where the user pastes
 *     a sample model output and sees the evaluator decide pass / fail
 *     in real time.
 *
 * Edits the safe subset of `InlineCase`: contains, not_contains, regex,
 * exact, json_schema. Tool-call evaluators and image attachments are
 * preserved on round-trip but only authorable via YAML — the form
 * surfaces a notice when one is opened in edit mode.
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
  const [sampleOutput, setSampleOutput] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSampleOutput('');
    if (initial === null) {
      setId('');
      setInput('');
      setWeight('1');
      setTags('custom');
      setRequires('');
      setEvalKind('contains');
      setEvalValue('PASS');
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

  // Build the candidate `expect` clause from the form for live preview.
  // Returns null when the user-entered config is currently invalid (e.g.
  // unparseable schema), so the preview pane can show a hint.
  const previewExpect = useMemo<{ ok: true; expect: InlineCase['expect'] } | { ok: false; error: string }>(() => {
    if (advancedLocked && initial !== null) {
      return { ok: true, expect: initial.expect };
    }
    if (evalKind === 'json_schema') {
      try {
        return { ok: true, expect: { kind: 'json_schema', schema: JSON.parse(evalSchema || '{}') } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (evalKind === 'tool_call') {
      return { ok: false, error: 'tool_call cases must be edited via YAML.' };
    }
    return { ok: true, expect: { kind: evalKind, value: evalValue } };
  }, [advancedLocked, initial, evalKind, evalSchema, evalValue]);

  const liveOutcome = useMemo(() => {
    if (!previewExpect.ok) return null;
    if (sampleOutput === '') return null;
    try {
      return evaluateOutput(sampleOutput, previewExpect.expect);
    } catch (e) {
      return { passed: false, score: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [previewExpect, sampleOutput]);

  /**
   * Build an InlineCase from the current form state. Returns either a
   * validated case or a structured error so callers can decide whether
   * to surface it in the form (Save) or the test pane (Run test).
   */
  const buildCase = (): { ok: true; case: InlineCase } | { ok: false; error: string } => {
    const trimmedId = id.trim();
    if (trimmedId === '') return { ok: false, error: 'id is required.' };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmedId)) {
      return {
        ok: false,
        error: 'id must be lowercase letters, digits, and dashes (e.g. `my-test-1`).',
      };
    }
    if (mode === 'add' && idIsTaken(trimmedId)) {
      return { ok: false, error: `A case with id "${trimmedId}" already exists.` };
    }
    if (mode === 'edit' && initial !== null && trimmedId !== initial.id && idIsBuiltin) {
      return {
        ok: false,
        error: 'Built-in case ids cannot be renamed (they anchor skip / retry).',
      };
    }
    if (input.trim() === '') return { ok: false, error: 'input is required.' };
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      return { ok: false, error: 'weight must be a positive number.' };
    }
    if (!previewExpect.ok) return { ok: false, error: `evaluator: ${previewExpect.error}` };
    if (
      !advancedLocked &&
      evalKind !== 'json_schema' &&
      evalKind !== 'tool_call' &&
      evalValue === ''
    ) {
      return { ok: false, error: `Evaluator "${evalKind}" needs a non-empty value.` };
    }
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return {
      ok: true,
      case: {
        id: trimmedId,
        input,
        expect: previewExpect.expect,
        weight: w,
        tags: tagList,
        ...(requires === '' ? {} : { requires }),
        ...(initial?.tools !== undefined && advancedLocked ? { tools: initial.tools } : {}),
        ...(initial?.image !== undefined && advancedLocked ? { image: initial.image } : {}),
      },
    };
  };

  const onSubmit = () => {
    setError(null);
    const built = buildCase();
    if (!built.ok) {
      setError(built.error);
      return;
    }
    onSave(built.case);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(1100px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-border bg-bg-elevated px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-fg">
                {mode === 'add' ? 'Add eval case' : 'Edit eval case'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-fg-muted">
                Saved to your browser. Custom cases run alongside the built-in suite.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg-muted hover:bg-bg-subtle"
              >
                ✕
              </button>
            </Dialog.Close>
          </header>

          <div className="flex flex-1 flex-col gap-0 overflow-auto lg:flex-row">
            {/* ───── Form pane ───── */}
            <div className="flex-1 border-border p-6 lg:max-w-[58%] lg:border-r">
              <div className="flex flex-col gap-5 text-sm">
                <Field
                  label="id"
                  hint="lowercase, dashes — stable identifier used by skip & retry"
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

                <Field label="prompt" hint="exactly what the model receives as the user message">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[13px] leading-relaxed text-fg"
                    placeholder="Reply with PASS."
                  />
                </Field>

                {advancedLocked ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    This case uses an advanced evaluator (tool-call) or attachment (image). Edit
                    those fields by exporting to YAML and re-importing.
                  </div>
                ) : (
                  <Field label="evaluator">
                    <div className="flex flex-col gap-2">
                      <select
                        value={evalKind}
                        onChange={(e) => setEvalKind(e.target.value as EvalKind)}
                        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg sm:max-w-[16rem]"
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
                          rows={8}
                          spellCheck={false}
                          className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                          placeholder={'{\n  "type": "object",\n  "required": ["x"],\n  "properties": { "x": { "type": "number" } }\n}'}
                        />
                      ) : (
                        <input
                          type="text"
                          value={evalValue}
                          onChange={(e) => setEvalValue(e.target.value)}
                          spellCheck={false}
                          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
                          placeholder={evalKind === 'regex' ? '^PASS$' : 'PASS'}
                        />
                      )}
                      <p className="text-[11px] text-fg-muted">{evalKindHint(evalKind)}</p>
                    </div>
                  </Field>
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
            </div>

            {/* ───── Live preview pane ───── */}
            <aside className="flex-1 bg-bg-subtle/40 p-6 lg:max-w-[42%]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
                Preview
              </p>
              <h3 className="mt-1 text-sm font-semibold text-fg">How the row will appear</h3>
              <CardPreview
                id={id || '(unset)'}
                source={mode === 'add' ? 'custom' : idIsBuiltin ? 'edited' : 'custom'}
                evalKind={evalKind}
                requires={requires === '' ? null : requires}
                tags={tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)}
                input={input}
              />

              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
                  Try it
                </p>
                <h3 className="mt-1 text-sm font-semibold text-fg">
                  Paste a sample model output to test the evaluator
                </h3>
                <textarea
                  value={sampleOutput}
                  onChange={(e) => setSampleOutput(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder="(model would reply here…)"
                  className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                />
                <OutcomeChip
                  outcome={liveOutcome}
                  invalid={!previewExpect.ok ? previewExpect.error : null}
                />
              </div>

            </aside>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border bg-bg-elevated px-6 py-4">
            <p className="text-[11px] text-fg-faint">
              {mode === 'edit' && idIsBuiltin
                ? 'Editing a built-in case stores an override; press Reset later to restore the default.'
                : 'Custom cases live in your browser only.'}
            </p>
            <div className="flex gap-2">
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
          </footer>
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

function CardPreview({
  id,
  source,
  evalKind,
  requires,
  tags,
  input,
}: {
  id: string;
  source: 'edited' | 'custom';
  evalKind: EvalKind;
  requires: 'tool_use' | 'vision' | null;
  tags: readonly string[];
  input: string;
}) {
  const sourceTone =
    source === 'edited' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-accent/15 text-accent';
  const preview = input.replace(/\s+/g, ' ').slice(0, 110);
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {id}
        </code>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sourceTone}`}
        >
          {source}
        </span>
        <span className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          {evalKind}
        </span>
        {requires !== null ? (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            needs {requires}
          </span>
        ) : null}
        {tags.slice(0, 3).map((t) => (
          <span key={t} className="text-[10px] text-fg-faint">
            #{t}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
        {preview === '' ? <span className="italic text-fg-faint">(prompt is empty)</span> : preview}
        {input.length > 110 ? '…' : ''}
      </p>
    </div>
  );
}

interface MaybeOutcome {
  readonly passed: boolean;
  readonly score: number;
  readonly error?: string;
}

function OutcomeChip({
  outcome,
  invalid,
}: {
  outcome: MaybeOutcome | null;
  invalid: string | null;
}) {
  if (invalid !== null) {
    return (
      <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
        Evaluator unparseable — fix to enable live preview ({invalid}).
      </p>
    );
  }
  if (outcome === null) {
    return (
      <p className="mt-2 text-[11px] text-fg-faint">
        Type a sample output above and the evaluator will score it live.
      </p>
    );
  }
  if (outcome.error !== undefined) {
    return (
      <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-danger/15 px-3 py-1 text-[12px] font-semibold text-danger">
        <span aria-hidden>✕</span>
        <span>Evaluator error: {outcome.error}</span>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
          outcome.passed
            ? 'bg-success/15 text-success'
            : 'bg-danger/15 text-danger'
        }`}
      >
        <span aria-hidden>{outcome.passed ? '✓' : '✕'}</span>
        <span>{outcome.passed ? 'PASS' : 'FAIL'}</span>
      </span>
      <span className="font-mono text-[11px] text-fg-muted">
        score {outcome.score.toFixed(2)}
      </span>
    </div>
  );
}

function evalKindHint(kind: EvalKind): string {
  switch (kind) {
    case 'contains':
      return 'Pass when the output contains the value as a substring (case-sensitive).';
    case 'not_contains':
      return 'Pass when the output does NOT contain the value (useful for safety / leak checks).';
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
