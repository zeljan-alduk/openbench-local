import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InlineCase, ToolSpec } from './builtin-suite';
import { evaluateOutput } from './evaluator-direct';

/**
 * Eval-case editor.
 *
 * Left pane: editable fields (id, prompt, attachments, evaluator,
 * weight, tags, capability gate, optional tools spec).
 * Right pane: live row preview + "Try it" sandbox that scores a
 * pasted sample output through the evaluator in real time.
 *
 * All InlineCase fields are authorable: simple evaluators (contains,
 * not_contains, regex, exact, json_schema), tool_call evaluators
 * (function name + args schema + tools array), and image attachments
 * (file picker → data URL). Plain-text / code files can also be
 * picked: their contents are appended to the prompt textarea so the
 * user can edit before saving.
 */

type EvalKind = InlineCase['expect']['kind'];
const ALL_KINDS: ReadonlyArray<EvalKind> = [
  'contains',
  'not_contains',
  'regex',
  'exact',
  'json_schema',
  'tool_call',
];
const ATTACH_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.json,.yaml,.yml,.csv,.xml,.html,.ts,.tsx,.js,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.sh,.toml,.ini,.log,text/*';

// Size caps. These are deliberately conservative because attachments
// land in localStorage as part of the case object, and localStorage is
// shared by the whole origin (~5–10 MB total quota in most browsers).
// Base64 encoding inflates by ~33% on top of the raw bytes.
const MAX_TEXT_BYTES = 200_000; // 200 KB — typical for code/markdown excerpts
const MAX_IMAGE_BYTES = 2_000_000; // 2 MB raw → ~2.7 MB encoded
// Common binary extensions we explicitly reject because the OpenAI-compat
// chat-completion endpoint local engines speak doesn't accept them. The
// user is told to extract text first (pdf.js, SheetJS, mammoth, etc.).
const BINARY_EXTS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
  'tar',
  'gz',
  '7z',
  'rar',
  'mp3',
  'mp4',
  'wav',
  'm4a',
  'flac',
  'opus',
  'ogg',
  'avi',
  'mov',
  'mkv',
  'webm',
  'exe',
  'bin',
  'dat',
  'sqlite',
  'db',
  'psd',
  'ai',
  'sketch',
  'fig',
]);

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
  // tool_call evaluator: function name + (optional) args schema JSON.
  const [toolName, setToolName] = useState('');
  const [toolArgsSchema, setToolArgsSchema] = useState('');
  // Attached image: stored as a data URL so the user message can carry
  // it inline (OpenAI-compat `image_url` content part).
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState<string>('');
  const [imageName, setImageName] = useState<string>('');
  // Tools spec — optional per case. JSON-encoded array of OpenAI
  // tool definitions; the runner sends them on the chat-completion
  // request when present, even for non-tool_call evaluators (lets a
  // contains-evaluator confirm the model produced the right answer
  // *after* a tool round-trip).
  const [toolsSpec, setToolsSpec] = useState('');
  const [showToolsSpec, setShowToolsSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sampleOutput, setSampleOutput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAttachError(null);
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
      setToolName('');
      setToolArgsSchema('');
      setImageDataUrl(null);
      setImageAlt('');
      setImageName('');
      setToolsSpec('');
      setShowToolsSpec(false);
      return;
    }
    setId(initial.id);
    setInput(initial.input);
    setWeight(String(initial.weight));
    setTags(initial.tags.join(', '));
    setRequires(initial.requires ?? '');
    if (initial.expect.kind === 'tool_call') {
      setEvalKind('tool_call');
      setEvalValue('');
      setEvalSchema('');
      setToolName(initial.expect.name);
      setToolArgsSchema(
        initial.expect.argsSchema !== undefined
          ? JSON.stringify(initial.expect.argsSchema, null, 2)
          : '',
      );
    } else if (initial.expect.kind === 'json_schema') {
      setEvalKind('json_schema');
      setEvalValue('');
      setEvalSchema(JSON.stringify(initial.expect.schema, null, 2));
      setToolName('');
      setToolArgsSchema('');
    } else {
      setEvalKind(initial.expect.kind);
      setEvalValue(initial.expect.value);
      setEvalSchema('');
      setToolName('');
      setToolArgsSchema('');
    }
    setImageDataUrl(initial.image?.dataUrl ?? null);
    setImageAlt(initial.image?.alt ?? '');
    setImageName(initial.image !== undefined ? 'attached image' : '');
    if (initial.tools !== undefined) {
      setToolsSpec(JSON.stringify(initial.tools, null, 2));
      setShowToolsSpec(true);
    } else {
      setToolsSpec('');
      setShowToolsSpec(false);
    }
  }, [open, initial]);

  /**
   * Attachment picker handler. We branch on file kind:
   *
   *  - Image (image/*) → read as data URL, store in `imageDataUrl`.
   *    Wired through to the model as an `image_url` content part.
   *  - Text-ish file → read as UTF-8 text and append to the prompt
   *    textarea between fences so the user can edit before saving.
   *    There's no schema-level "file" attachment — it just becomes
   *    part of the prompt string.
   *
   * Strict size caps prevent a 30MB photo from blowing the request
   * budget and a 2GB log file from freezing the tab.
   */
  const onAttachFile = (file: File) => {
    setAttachError(null);
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (BINARY_EXTS.has(ext)) {
      setAttachError(
        `${ext.toUpperCase()} files aren't supported by local chat-completion APIs. Extract text first (pdf.js for PDFs, SheetJS for spreadsheets, a STT endpoint for audio) and paste the result into the prompt.`,
      );
      return;
    }
    if (file.type.startsWith('image/')) {
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError(
          `Image too big (${(file.size / 1_000_000).toFixed(1)} MB > ${MAX_IMAGE_BYTES / 1_000_000} MB cap). Compress or resize first — base64-encoded images live in localStorage with the case.`,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          setImageDataUrl(result);
          setImageName(file.name);
          if (imageAlt === '') setImageAlt(file.name);
        }
      };
      reader.onerror = () => setAttachError('Failed to read image.');
      reader.readAsDataURL(file);
      return;
    }
    if (file.size > MAX_TEXT_BYTES) {
      setAttachError(
        `File too big (${(file.size / 1000).toFixed(0)} KB > ${MAX_TEXT_BYTES / 1000} KB). Trim first.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const fenced = `\n\n=== ${file.name} ===\n${result}\n=== /${file.name} ===\n`;
        setInput((prev) => `${prev}${fenced}`);
      }
    };
    reader.onerror = () => setAttachError('Failed to read file.');
    reader.readAsText(file);
  };

  const onClearImage = () => {
    setImageDataUrl(null);
    setImageAlt('');
    setImageName('');
  };

  // Build the candidate `expect` clause from the form for live preview.
  // Returns an `error` variant when the user-entered config is currently
  // invalid (e.g. unparseable schema), so the preview pane can show a hint.
  const previewExpect = useMemo<
    { ok: true; expect: InlineCase['expect'] } | { ok: false; error: string }
  >(() => {
    if (evalKind === 'json_schema') {
      try {
        return {
          ok: true,
          expect: { kind: 'json_schema', schema: JSON.parse(evalSchema || '{}') },
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (evalKind === 'tool_call') {
      const trimmedName = toolName.trim();
      if (trimmedName === '') {
        return { ok: false, error: 'tool_call: function name is required.' };
      }
      if (toolArgsSchema.trim() === '') {
        return { ok: true, expect: { kind: 'tool_call', name: trimmedName } };
      }
      try {
        return {
          ok: true,
          expect: { kind: 'tool_call', name: trimmedName, argsSchema: JSON.parse(toolArgsSchema) },
        };
      } catch (e) {
        return { ok: false, error: `args schema: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return { ok: true, expect: { kind: evalKind, value: evalValue } };
  }, [evalKind, evalSchema, evalValue, toolName, toolArgsSchema]);

  // Tools-array preview (for the `tools` field on the case). Empty
  // string → no tools attached.
  const previewTools = useMemo<
    { ok: true; tools: readonly ToolSpec[] | undefined } | { ok: false; error: string }
  >(() => {
    if (!showToolsSpec || toolsSpec.trim() === '') return { ok: true, tools: undefined };
    try {
      const parsed = JSON.parse(toolsSpec);
      if (!Array.isArray(parsed)) {
        return { ok: false, error: 'Tools must be a JSON array.' };
      }
      return { ok: true, tools: parsed as readonly ToolSpec[] };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [showToolsSpec, toolsSpec]);

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
      evalKind !== 'json_schema' &&
      evalKind !== 'tool_call' &&
      evalValue === ''
    ) {
      return { ok: false, error: `Evaluator "${evalKind}" needs a non-empty value.` };
    }
    if (!previewTools.ok) return { ok: false, error: `tools: ${previewTools.error}` };
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const image =
      imageDataUrl !== null
        ? { dataUrl: imageDataUrl, ...(imageAlt.trim() !== '' ? { alt: imageAlt.trim() } : {}) }
        : undefined;
    return {
      ok: true,
      case: {
        id: trimmedId,
        input,
        expect: previewExpect.expect,
        weight: w,
        tags: tagList,
        ...(requires === '' ? {} : { requires }),
        ...(previewTools.tools !== undefined ? { tools: previewTools.tools } : {}),
        ...(image !== undefined ? { image } : {}),
        // Preserve a parameterization block the structured editor doesn't
        // author. `input` / evaluator `value` stay {{var}} templates;
        // authoring the `generate` block itself is done via YAML.
        ...(initial?.generate !== undefined ? { generate: initial.generate } : {}),
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

                {initial?.generate !== undefined ? (
                  <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
                    <span className="font-semibold text-accent">⚙ Parameterized case.</span> The{' '}
                    <code className="font-mono">{'{{var}}'}</code> placeholders in the prompt and
                    evaluator value are filled from a <code className="font-mono">generate</code>{' '}
                    block, re-sampled fresh each run. You can edit the wording here; to change the
                    variables or answer formula, export to YAML, edit the{' '}
                    <code className="font-mono">generate</code> block, and re-import. The block is
                    preserved on save.
                  </div>
                ) : null}

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

                <Field
                  label="attachment"
                  hint="Image → vision content part (sets capability gate). Text/code → appended to the prompt. Binaries (PDF / Word / Excel / audio) need text extraction first."
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ATTACH_ACCEPT}
                      onChange={(ev) => {
                        const file = ev.target.files?.[0];
                        ev.target.value = '';
                        if (file !== undefined) onAttachFile(file);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-bg-subtle"
                    >
                      Pick file…
                    </button>
                    {imageDataUrl !== null ? (
                      <span className="font-mono text-[11px] text-fg-muted">
                        Image attached: {imageName}
                      </span>
                    ) : (
                      <span className="text-[11px] text-fg-faint">
                        No image. Text-like files append to the prompt instead.
                      </span>
                    )}
                  </div>
                  {imageDataUrl !== null ? (
                    <div className="mt-2 flex items-start gap-3 rounded-md border border-border bg-bg p-2">
                      {/* biome-ignore lint/a11y/useAltText: alt set via input below */}
                      <img
                        src={imageDataUrl}
                        alt={imageAlt}
                        className="h-20 w-20 rounded object-cover"
                      />
                      <div className="flex flex-1 flex-col gap-1.5 text-[12px]">
                        <input
                          type="text"
                          value={imageAlt}
                          onChange={(e) => setImageAlt(e.target.value)}
                          placeholder="alt text (optional)"
                          className="w-full rounded-md border border-border bg-bg px-2 py-1 font-mono text-[12px] text-fg"
                        />
                        <button
                          type="button"
                          onClick={onClearImage}
                          className="self-start rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10"
                        >
                          Remove image
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {attachError !== null ? (
                    <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
                      {attachError}
                    </p>
                  ) : null}
                </Field>

                <Field label="evaluator">
                  <div className="flex flex-col gap-2">
                    <select
                      value={evalKind}
                      onChange={(e) => setEvalKind(e.target.value as EvalKind)}
                      className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg sm:max-w-[16rem]"
                    >
                      {ALL_KINDS.map((k) => (
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
                    ) : evalKind === 'tool_call' ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={toolName}
                          onChange={(e) => setToolName(e.target.value)}
                          spellCheck={false}
                          placeholder="function name (e.g. get_weather)"
                          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg"
                        />
                        <textarea
                          value={toolArgsSchema}
                          onChange={(e) => setToolArgsSchema(e.target.value)}
                          rows={5}
                          spellCheck={false}
                          placeholder="(optional) args JSON schema"
                          className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                        />
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Don't forget the tools spec below — without it the model has nothing to
                          call.
                        </p>
                      </div>
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

                <details
                  open={showToolsSpec}
                  onToggle={(ev) => setShowToolsSpec((ev.target as HTMLDetailsElement).open)}
                  className="rounded-md border border-border bg-bg p-3"
                >
                  <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                    Tools spec (advanced)
                  </summary>
                  <p className="mt-2 text-[11px] text-fg-faint">
                    JSON array of OpenAI-shape tool definitions. Sent on the chat-completion
                    request when present. Required for <code>tool_call</code> evaluators; optional
                    for everything else.
                  </p>
                  <textarea
                    value={toolsSpec}
                    onChange={(e) => setToolsSpec(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className="mt-2 w-full resize-y rounded-md border border-border bg-bg-elevated px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                    placeholder={'[\n  {\n    "type": "function",\n    "function": {\n      "name": "get_weather",\n      "description": "Look up current weather",\n      "parameters": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }\n    }\n  }\n]'}
                  />
                  {!previewTools.ok ? (
                    <p className="mt-1 text-[11px] text-danger">{previewTools.error}</p>
                  ) : null}
                </details>

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
