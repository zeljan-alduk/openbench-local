# Design: editor-sharing-ux — case-editor integration for new case fields + run import/share UX

All paths are under `/Users/aldo/Documents/ai/openbench-local/src/components/local-models/`.

---

## Part A — Case editor, panel badges, YAML validation for `turns` / `toolResponders` / `contextSweep`

### A0. Assumed data-layer contract (must be synced with the data workstream)

The UI layer codes against these `InlineCase` additions (declared in `builtin-suite.ts` alongside `CaseGenerator`, ~line 105):

```ts
/** One follow-up user message sent after the model's previous reply. */
export interface CaseTurn {
  readonly user: string;
}

/** Canned tool result fed back when the model calls `name` during the loop. */
export interface ToolResponder {
  readonly name: string;
  /** Literal string returned as the `tool` role message content. */
  readonly response: string;
}

export interface ContextSweep {
  /** Fill levels (approx tokens of padding) the case is re-run at. */
  readonly fillTokens: readonly number[];
}

export interface InlineCase {
  // …existing fields…
  readonly turns?: readonly CaseTurn[];
  readonly toolResponders?: readonly ToolResponder[];
  readonly contextSweep?: ContextSweep;
}
```

Decision: **`turns` is authorable in the structured editor; `toolResponders` and `contextSweep` are YAML-authored, preserve-only** — exactly the precedent set by `generate` (see the banner at `case-edit-modal.tsx:483-493` and the preservation spread at `:424`).

### A1. `buildCase()` preservation additions — `case-edit-modal.tsx:408-426`

The spread currently drops any field not explicitly listed. Exact additions inside the returned `case` object (after the existing `generate` preservation line at `:424`):

```ts
// Authored by the turns sub-form (state, not preserved):
...(turnsClean.length > 0 ? { turns: turnsClean } : {}),
// Preserve-only blocks the structured editor doesn't author (YAML-only,
// same policy as `generate` above):
...(initial?.toolResponders !== undefined ? { toolResponders: initial.toolResponders } : {}),
...(initial?.contextSweep !== undefined ? { contextSweep: initial.contextSweep } : {}),
```

where

```ts
const turnsClean: readonly CaseTurn[] = turns
  .map((t) => ({ user: t.user }))
  .filter((t) => t.user.trim() !== '');
```

Also add a second info banner directly under the existing generate banner (`:493`), same accent-tinted styling:

```tsx
{initial?.toolResponders !== undefined || initial?.contextSweep !== undefined ? (
  <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
    <span className="font-semibold text-accent">⚙ Advanced blocks preserved.</span> This case
    carries {initial?.toolResponders !== undefined ? <code className="font-mono">toolResponders</code> : null}
    {initial?.toolResponders !== undefined && initial?.contextSweep !== undefined ? ' and ' : null}
    {initial?.contextSweep !== undefined ? <code className="font-mono">contextSweep</code> : null}{' '}
    authored via YAML. They are kept as-is on save; to change them, export to YAML, edit, and
    re-import.
  </div>
) : null}
```

### A2. Turns sub-form (copy of the `AcceptDraft[]` repeatable-row pattern at `:653-735`)

New draft type + state next to `AcceptDraft` (`:7` / `:125`):

```ts
/** Editable draft of one follow-up user turn. */
type TurnDraft = { user: string };

const [turns, setTurns] = useState<TurnDraft[]>([]);
```

Hydration in the `open` effect (`:135-206`): add `setTurns([])` to the add-mode reset block and

```ts
setTurns((initial.turns ?? []).map((t) => ({ user: t.user })));
```

to the edit-mode branch.

UI: a `Field` placed immediately after the **prompt** field (`:504`), before the attachment field — conversation order reads top-down:

```tsx
<Field
  label="follow-up turns (multi-turn)"
  hint="optional — extra user messages sent one at a time after each model reply; the evaluator scores only the final reply"
>
  <div className="flex flex-col gap-2">
    {turns.length === 0 ? (
      <p className="text-[11px] text-fg-faint">
        None — single-turn case. Add a turn to test conversational memory or instruction persistence.
      </p>
    ) : null}
    {turns.map((t, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and have no stable id
      <div key={i} className="flex items-start gap-2 rounded-md border border-border bg-bg-subtle/40 p-2">
        <span className="mt-2 shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          turn {i + 2}
        </span>
        <textarea
          value={t.user}
          onChange={(e) =>
            setTurns((prev) => prev.map((x, j) => (j === i ? { user: e.target.value } : x)))
          }
          rows={2}
          spellCheck={false}
          placeholder="Now answer again, but in French."
          className="min-w-0 flex-1 resize-y rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-[12px] leading-relaxed text-fg"
        />
        <button
          type="button"
          onClick={() => setTurns((prev) => prev.filter((_, j) => j !== i))}
          aria-label="Remove turn"
          className="rounded-md px-2 py-1 text-[12px] text-fg-muted hover:bg-bg-subtle hover:text-fg"
        >
          ✕
        </button>
      </div>
    ))}
    <button
      type="button"
      onClick={() => setTurns((prev) => [...prev, { user: '' }])}
      className="self-start rounded-md border border-border px-2.5 py-1 text-[12px] text-fg-muted hover:bg-bg-subtle hover:text-fg"
    >
      + Add follow-up turn
    </button>
  </div>
</Field>
```

Label "turn N+2" because the `input` prompt is turn 1 and the model reply between turns is implicit.

### A3. Try-it sandbox degradation (final-answer-only)

`evaluateRow` (`evaluator-direct.ts`) already scores a single `{content, toolCalls}` — no change to the live-outcome wiring at `:348-361`. Add an annotation between the "Paste a sample model output…" heading (`:827-829`) and the textarea, shown when the case is multi-step; reuse the amber hint pattern from `attachError` (`:565-569`):

```tsx
{turns.some((t) => t.user.trim() !== '') || initial?.toolResponders !== undefined ? (
  <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
    Final-answer sandbox: this case runs as a multi-step exchange
    {turns.some((t) => t.user.trim() !== '') ? ` (${turns.filter((t) => t.user.trim() !== '').length + 1} turns)` : ''}
    {initial?.toolResponders !== undefined ? ' with a tool loop' : ''}, but the sandbox can’t replay
    turns or tool round-trips. Paste only what the model would say as its <em>final</em> reply — that
    is the text the evaluator scores.
  </p>
) : null}
{initial?.contextSweep !== undefined ? (
  <p className="mt-2 text-[11px] text-fg-muted">
    Context sweep isn’t simulated here — the sandbox scores one plain instance at zero fill.
  </p>
) : null}
```

### A4. Row badges — `cases-panel.tsx` `CaseRow` (copy the param-chip pattern at `:442-449`)

Insert after the `⚖ soften` chip (`:457`), all using the accent tone (param-chip idiom); `soften` keeps amber as the only "leniency" color:

```tsx
{c.turns !== undefined && c.turns.length > 0 ? (
  <span
    className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
    title={`Multi-turn — ${c.turns.length + 1} user turns sent sequentially; the evaluator scores the final reply.`}
  >
    ⇄ {c.turns.length + 1}-turn
  </span>
) : null}
{c.toolResponders !== undefined ? (
  <span
    className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
    title="Tool loop — canned tool results are fed back to the model until it produces a final answer. Authorable via the toolResponders block in exported YAML."
  >
    ⟳ tool-loop
  </span>
) : null}
{c.contextSweep !== undefined ? (
  <span
    className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
    title="Context sweep — re-run at increasing context fill levels to measure long-context degradation. Authorable via the contextSweep block in exported YAML."
  >
    ⇥ sweep
  </span>
) : null}
```

Mirror the same three chips in `CardPreview` (`case-edit-modal.tsx:897-946`) driven by the live form state (`turnsClean.length`, `initial?.toolResponders`, `initial?.contextSweep`) so the editor preview matches the row.

### A5. YAML validators — `cases-yaml.ts`

In `validateShape` (`:80-103`), after the `forgiveFormatting` check:

```ts
if (c.turns !== undefined) validateTurns(c.id, c.turns);
if (c.toolResponders !== undefined) validateToolResponders(c.id, c.toolResponders);
if (c.contextSweep !== undefined) validateContextSweep(c.id, c.contextSweep);
```

New helpers mirroring `validateGenerate` (`:135`) — same throw-with-caseId style:

```ts
/** Shape-check the multi-turn `turns` list. */
function validateTurns(caseId: string, turns: unknown): void {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error(`Case "${caseId}": \`turns\` must be a non-empty array.`);
  }
  for (const t of turns as unknown[]) {
    if (t === null || typeof t !== 'object' || typeof (t as { user?: unknown }).user !== 'string'
        || ((t as { user: string }).user.trim() === '')) {
      throw new Error(`Case "${caseId}": each \`turns\` entry needs a non-empty \`user\` string.`);
    }
  }
}

/** Shape-check the tool-loop `toolResponders` list. */
function validateToolResponders(caseId: string, responders: unknown): void {
  if (!Array.isArray(responders) || responders.length === 0) {
    throw new Error(`Case "${caseId}": \`toolResponders\` must be a non-empty array.`);
  }
  for (const r of responders as unknown[]) {
    if (r === null || typeof r !== 'object') {
      throw new Error(`Case "${caseId}": each \`toolResponders\` entry must be an object.`);
    }
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || o.name.trim() === '') {
      throw new Error(`Case "${caseId}": \`toolResponders\` entry needs a non-empty \`name\`.`);
    }
    if (typeof o.response !== 'string') {
      throw new Error(`Case "${caseId}": \`toolResponders\` "${String(o.name)}" needs a string \`response\`.`);
    }
  }
}

/** Shape-check the `contextSweep` block. */
function validateContextSweep(caseId: string, sweep: unknown): void {
  if (sweep === null || typeof sweep !== 'object') {
    throw new Error(`Case "${caseId}": \`contextSweep\` must be an object with a \`fillTokens\` array.`);
  }
  const fills = (sweep as { fillTokens?: unknown }).fillTokens;
  if (!Array.isArray(fills) || fills.length === 0
      || fills.some((f) => typeof f !== 'number' || !Number.isFinite(f) || f < 0)) {
    throw new Error(`Case "${caseId}": \`contextSweep.fillTokens\` must be a non-empty array of non-negative numbers.`);
  }
}
```

Unknown extra keys still survive round-trip (parser stays permissive) — backward compatible with old files; old app versions simply ignore the new fields (localStorage case objects are spread-preserved by `case-store.ts`, which stores whole objects).

---

## Part B — Run import + share UX

### B0. Data-layer contract (new module `run-share.ts`, designed separately — this is the interface the UI consumes)

```ts
// run-share.ts
import type { StoredRun } from './history-store';

export interface RunBundleV1 {
  readonly format: 'openbench-local/runs';
  readonly version: 1;
  readonly exportedAt: string; // ISO
  readonly runs: readonly StoredRun[];
}

export function encodeRunBundle(runs: readonly StoredRun[]): string;        // pretty JSON
export function decodeRunBundle(text: string): readonly StoredRun[];       // throws Error with user-facing message

export const SHARE_HASH_PREFIX = '#share=';
export const SHARE_LINK_BYTE_CAP = 32_768; // compressed-payload cap

export type ShareEncodeResult =
  | { readonly ok: true; readonly url: string; readonly bytes: number }
  | { readonly ok: false; readonly reason: 'too-large'; readonly bytes: number; readonly limit: number };

export function encodeShareUrl(runs: readonly StoredRun[]): ShareEncodeResult; // 1 run or a comparison
/** null = hash isn't ours; throws on a corrupt/newer-version payload. */
export function decodeShareHash(hash: string): readonly StoredRun[] | null;
```

Hash-based permalinks (`#share=…`) work under the `base: './'` gh-pages sub-path with zero routing.

### B1. Persistence: origin flag (no IDB migration)

`history-store.ts` — add two optional fields to `StoredRun` (`:34`) and `RunMeta` (`:221`):

```ts
readonly origin?: 'imported';   // absent = ran locally (backward compatible with every v1 record)
readonly importedAt?: number;   // epoch ms, set at import time
```

`DB_VERSION` stays **1** — records are schemaless and no new index is needed. `storedToRunState` (`:199`) passes both through. Add the missing inverse helper (also reusable by share):

```ts
/** Inverse of storedToRunState — snapshot an in-memory run for IDB / share. */
export function runStateToStored(r: ModelRunState & RunMeta): StoredRun;
```

`multi-bench-panel.tsx` `ModelRunState` (`:40`) gains `readonly origin?: 'imported';`.

### B2. 'Import runs' button — placement + flow + error surface

**Placement: HistoryDialog footer left cluster (`history-dialog.tsx:231-241`)**, next to the select-all checkbox — History is always reachable (button at shell `:765`), where imported runs land, and it keeps the shell header cluster from growing. Two new footer buttons (neutral styling, no red hover):

- `Import runs…` → hidden `<input type="file" accept="application/json,.json">`
- `Export selected` (enabled when `selected.size > 0`) → `encodeRunBundle` of selected `StoredRun`s → blob download `openbench-local-runs-YYYY-MM-DD.json` (same anchor-download idiom as `cases-panel.tsx:108-118`). This is the oversized-link fallback path.

**Import flow** (inside HistoryDialog — the shell only receives the result):

```ts
const [importStatus, setImportStatus] = useState<{ tone: 'ok' | 'error'; msg: string } | null>(null);

const onImportFile = async (file: File) => {
  setImportStatus(null);
  try {
    const incoming = decodeRunBundle(await file.text());
    const have = new Set(stored.map((r) => r.runId));
    const added: StoredRun[] = [];
    for (const run of incoming) {
      if (have.has(run.runId)) continue;               // dedupe: existing wins
      const stamped: StoredRun = { ...run, origin: 'imported', importedAt: Date.now() };
      await putRun(stamped);
      added.push(stamped);
    }
    onRunsImported(added);
    await refresh();
    const skipped = incoming.length - added.length;
    setImportStatus({
      tone: 'ok',
      msg: `Imported ${added.length} run${added.length === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} already in history` : ''}.`,
    });
  } catch (e) {
    setImportStatus({ tone: 'error', msg: e instanceof Error ? e.message : String(e) });
  }
};
```

**Error surface**: inline banner rendered at the top of the scroll body (above the session list, `:203`), copying the shell's amber banner idiom (`local-models-shell.tsx:800-804`); success uses the emerald variant:

```tsx
{importStatus !== null ? (
  <div className={importStatus.tone === 'error'
    ? 'mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'
    : 'mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400'}>
    {importStatus.msg}
  </div>
) : null}
```

Decision: the importer accepts **only** the `RunBundleV1` / share-hash formats — the report `downloadJson` payload (`report-export.ts:45-68`) lacks `runId`/`sessionId`/timestamps and is not losslessly importable; `decodeRunBundle` detects it and throws `'This is a report export, not a run bundle. Use History → Export selected to produce an importable file.'`

### B3. Imported-run badge

One shared chip (deliberately **sky**, a tone unused by pass/fail/status colors, so "foreign origin" never reads as a verdict):

```tsx
const IMPORTED_CHIP =
  'rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400';
```

- **History `RunRow`** (`history-dialog.tsx:381-388`): after the `{run.model.source}` span: `{run.origin === 'imported' ? <span className={IMPORTED_CHIP} title={...importedAt date...}>imported</span> : null}`
- **Comparison strip `CompareRow`** (`multi-bench-panel.tsx:293-300`): same chip in the model-identity cell under the source line.
- **Chart legend** (`quality-speed-chart.tsx`): `Point` (`:28`) gains `readonly origin?: 'imported';` (mapped at `:130-146` from `r.origin`); legend chips (`:400`) append a muted suffix ` · imported`, and the a11y table row gets the same suffix. No marker-shape change — color stays keyed by `runId` as today.

### B4. Clipboard util — new file `clipboard.ts`

```ts
/**
 * Copy text to the clipboard. Tries the async Clipboard API first
 * (requires a secure context), falls back to a hidden textarea +
 * execCommand('copy') for http://LAN origins. Returns false when
 * both fail so callers can degrade to window.prompt().
 */
export async function copyText(text: string): Promise<boolean>;

/** copyText + last-resort window.prompt('Copy this link:', text). Never throws. */
export async function copyTextOrPrompt(text: string): Promise<boolean>;
```

### B5. 'Copy share link' per-run — History `RunRow` (`history-dialog.tsx:349`)

`RunRow` stays self-contained (no new props from the dialog): add local state and a `Share` button before the delete `✕` (`:402`):

```ts
const [shareNote, setShareNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

const onShare = async () => {
  const res = encodeShareUrl([run]);
  if (!res.ok) {
    setShareNote({ tone: 'warn', text: `Too large for a link (${Math.round(res.bytes / 1024)} KB > ${Math.round(res.limit / 1024)} KB) — use Export selected` });
    return;
  }
  const copied = await copyTextOrPrompt(res.url);
  setShareNote({ tone: 'ok', text: copied ? 'Link copied ✓' : 'Link shown' });
};
```

`shareNote` renders as a small text next to the button (emerald / amber per tone) and auto-clears after 3 s via a `useEffect` timeout. Button styling copies the delete-button chrome (`:402-409`) with `hover:border-accent hover:text-accent` instead of red.

### B6. Share affordance for the current comparison

**Placement: a new `ExportMoreMenu` item** (`local-models-shell.tsx:1004-1039`) — `MenuButton` "Copy comparison link" — zero new header buttons. Threading:

```ts
// ExportMoreMenu props gain:
readonly onShareLink: () => void;

// shell:
const [shareNote, setShareNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
const onShareComparison = useCallback(async () => {
  const res = encodeShareUrl(runs.map(runStateToStored));
  if (!res.ok) {
    setShareNote({ tone: 'warn', text: `Comparison too large for a link (${Math.round(res.bytes / 1024)} KB > ${Math.round(res.limit / 1024)} KB compressed — long outputs). Open History → select runs → Export selected to share a .json file instead.` });
    return;
  }
  setShareNote({ tone: 'ok', text: (await copyTextOrPrompt(res.url)) ? 'Comparison link copied ✓' : 'Link shown' });
}, [runs]);
```

Scope decision: the link encodes **all runs currently in view** (exactly what the comparison strip/chart show). `shareNote` renders as one small line under the header cluster (`:796`, inside the existing flex column), auto-clearing after 4 s.

### B7. Read-only shared-run card — new file `shared-run-card.tsx`

Self-contained: owns hash parsing, rendering, dismiss, and import; the shell only merges the result.

```tsx
interface Props {
  /** Called with the runs actually written to IDB (already origin-stamped, dedup'd). */
  readonly onImported: (added: readonly StoredRun[]) => void;
}
export function SharedRunCard({ onImported }: Props): JSX.Element | null;
```

Behavior:
- Mount `useEffect`: `decodeShareHash(window.location.hash)` → `setShared(runs)`; `null` → render nothing; throw → render an amber error card ("This share link is corrupt or from a newer version.") with only a Dismiss button.
- **Mounts in `LocalModelsShell`** as the first child of the root `flex-col` div, above `<StatusStrip …>` (`local-models-shell.tsx:600`) — a permalink visitor sees the shared result before any local UI.
- Card chrome: `rounded-2xl border border-accent/40 bg-accent/5 shadow-sm` (accent-tinted so it reads as foreign), header chip `Shared run` / `Shared comparison (N)`, then one compact row per run: model id + source (mono), a params line reusing the `ParamLine` format (`history-dialog.tsx:415-427`), pass `x/y · pct%` with the existing tri-color threshold idiom (≥90 emerald / ≥60 amber / else red), avg tok/s, p95. Strictly read-only — no retry/expand.
- Footer: primary CTA **"Import into history"** + secondary **"Dismiss"**.
  - Dismiss: `history.replaceState(null, '', window.location.pathname + window.location.search)` then `setShared(null)`.
  - Import: `getAllRuns()` → skip existing runIds → `putRun({ ...run, origin: 'imported', importedAt: Date.now() })` → `onImported(added)` → dismiss. Idempotent on double-click.

Shell-side merge (the **only** shell growth besides B6 — one callback + one mounted component + one prop on HistoryDialog):

```ts
const onRunsImported = useCallback((added: readonly StoredRun[]) => {
  if (added.length === 0) return;
  setRuns((prev) => {
    const have = new Set(prev.map((r) => r.runId));
    const fresh = added
      .filter((r) => !have.has(r.runId))
      .map((s) => {
        const r = storedToRunState(s);
        const safePhase: RunPhase = r.phase === 'queued' || r.phase === 'running' ? 'stopped' : r.phase;
        return { ...r, phase: safePhase };
      });
    return [...prev, ...fresh];
  });
  setPhase((p) => (p === 'idle' || p === 'ready' ? 'done' : p));
}, []);
```

Wired to both `<SharedRunCard onImported={onRunsImported} />` and `<HistoryDialog … onRunsImported={onRunsImported} />` (`:843-848`). Everything else (file IO, decode, clipboard, hash) lives in leaf components/modules.

### B8. Oversized-payload messaging (canonical copy)

- Per-run (RunRow): `Too large for a link (187 KB > 32 KB) — use Export selected`
- Comparison (shell note): `Comparison too large for a link (412 KB > 32 KB compressed — long outputs). Open History → select runs → Export selected to share a .json file instead.`
- `decodeRunBundle` wrong-format error and share-hash corrupt error as quoted in B2/B7.

---

## File-change summary

| File | Change |
|---|---|
| `builtin-suite.ts` | `CaseTurn`, `ToolResponder`, `ContextSweep` types + 3 optional `InlineCase` fields (contract w/ data workstream) |
| `case-edit-modal.tsx` | `TurnDraft` state + hydration (`:135-206`), turns sub-form after prompt field (`:504`), preserved-blocks banner (`:493`), Try-it degradation notes (`:829`), `buildCase` additions (`:424`), `CardPreview` chips |
| `cases-panel.tsx` | 3 new chips in `CaseRow` after `:457` |
| `cases-yaml.ts` | `validateTurns` / `validateToolResponders` / `validateContextSweep` + 3 calls in `validateShape` (`:97-101`) |
| `run-share.ts` (new) | bundle + share-hash encode/decode (data-layer contract, B0) |
| `clipboard.ts` (new) | `copyText`, `copyTextOrPrompt` |
| `history-store.ts` | `StoredRun.origin/importedAt`, `RunMeta.origin/importedAt`, `runStateToStored()` |
| `history-dialog.tsx` | `onRunsImported` prop, Import/Export-selected footer buttons (`:231`), status banner (`:203`), Share button + note in `RunRow` (`:349`), imported chip (`:385`) |
| `multi-bench-panel.tsx` | `ModelRunState.origin?` (`:40`), imported chip in `CompareRow` (`:298`) |
| `quality-speed-chart.tsx` | `Point.origin?` (`:28`), legend/a11y ` · imported` suffix (`:400`, `:655`) |
| `shared-run-card.tsx` (new) | permalink card (B7) |
| `local-models-shell.tsx` | `onRunsImported` callback, `shareNote` state + line, `onShareComparison`, `<SharedRunCard>` mount above `:600`, `ExportMoreMenu.onShareLink` (`:1004`), new prop on `<HistoryDialog>` (`:843`) |

No new runtime deps (compression via native `CompressionStream` or hand-rolled in `run-share.ts` — data workstream's call). TS strict throughout; IDB v1 and localStorage case formats unchanged (only optional fields added).


## RISKS
- Field-name contract risk: `turns` / `toolResponders` / `contextSweep` shapes are assumed from the separately-designed data layer; if names or shapes diverge, buildCase() will silently drop the real fields on every editor save — the exact bug this workstream fixes. Sync the InlineCase additions in builtin-suite.ts before implementing.
- Privacy leak in shared payloads: StoredRun embeds DiscoveredLocalModel with host/port (including custom LAN hosts) and full model outputs. encodeShareUrl/encodeRunBundle should scrub or at least document this; otherwise a pasted link exposes internal network details.
- Share-link size in practice: many runs carry 100 cases of outputs + reasoning traces, so the 32 KB compressed cap will reject most single runs — the link path is mainly viable for summary-heavy payloads. If the data layer can't trim rows, the file-export path becomes the de-facto share mechanism and the link CTA may frustrate.
- runId-based dedupe keeps the existing local copy: re-importing an updated share of the same run (e.g. after retryCase changed rows) silently skips; 'already in history' messaging mitigates but users may expect replace semantics.
- Imported runs mix into aggregates: overallAvgTokps (shell :575) and the chart frontier blend runs from foreign hardware; the origin badge is visual-only. Acceptable for v1 but worth a note in the card copy.
- Clipboard on insecure origins: navigator.clipboard is unavailable over plain http (common for LAN-hosted builds); the execCommand fallback is deprecated and can also fail — window.prompt is the guaranteed last resort and must stay in copyTextOrPrompt.
- SharedRunCard mounts concurrently with the IDB hydration effect (shell :119-148); both call setRuns — the functional-update dedupe in onRunsImported must run after hydration or an imported runId could briefly duplicate; using runId-set filtering inside setRuns (as designed) avoids it, but only if 'Import into history' can't fire before hydration completes (button, not automatic — safe).
- Tri-color pass thresholds get a 5th inline duplication in SharedRunCard (existing 4x duplication noted in repo facts); consciously matching the existing idiom rather than refactoring — flag for a later cleanup pass.

## CRITIQUE (needs-changes)
- [major] Import dedupe never guards against duplicate runIds WITHIN one operation. In B2's onImportFile, `have` is built once from `stored` and never updated inside the loop, so a bundle containing the same runId twice (concatenated/hand-merged exports are the expected sharing workflow) puts both and pushes both into `added`. The shell's onRunsImported then filters `added` only against `prev` runs — not against itself — so `runs` ends up with duplicate runIds. runId is the React key everywhere (multi-bench-panel.tsx:97, :271, quality-speed-chart.tsx:402/:655), producing duplicate-key warnings, ghost rows in the comparison strip, and double-counted aggregates. B7's SharedRunCard import has the identical pattern.
  FIX: Add `have.add(run.runId)` after each accepted run in both import loops (HistoryDialog.onImportFile and SharedRunCard), and make onRunsImported's `fresh` filter also add to `have` as it iterates so intra-batch duplicates are dropped. Optionally have decodeRunBundle dedupe by runId as part of its contract.
- [major] decodeRunBundle/decodeShareHash validation depth is unspecified, and malformed imports are PERSISTED. A file matching the wrapper shape ({format:'openbench-local/runs', version:1, runs:[...]}) but with structurally broken runs (rows entries missing output/toolCalls/skipped, summary.byTag not an entry array, non-numeric startedAt) passes the design's stated checks, gets putRun()'d into IDB, and is rendered by BenchTable/CompareCell/deserialiseSummary which dereference row.output.length, row.toolCalls.map, s.byTag.map unconditionally. Because the shell's mount hydration (local-models-shell.tsx:119-148) re-loads every IDB record, one bad import crashes the whole shell on EVERY subsequent page load — permanent breakage with no recovery UI short of manually wiping IndexedDB.
  FIX: Make per-run structural validation an explicit contract of decodeRunBundle/decodeShareHash (mirror cases-yaml.ts validateShape strictness): runId/sessionId non-empty strings, startedAt/finishedAt finite numbers, phase in the RunPhase union, rows an array whose entries carry the BenchCaseRow fields the UI dereferences (id, output string, toolCalls array, skipped/passed booleans, totalMs number), summary null or SerialisedSummary-shaped with byTag as [string, {passed,total}] entries. Throw with the case-id-style user-facing message BEFORE anything reaches putRun.
- [major] B6's comparison-share path serializes UNSLIMMED in-memory rows. Only putRun strips imageDataUrl (slimRows, history-store.ts:127-141); rows of a freshly-run vision case still carry multi-megabyte data URLs in the shell's `runs` state. `runs.map(runStateToStored)` → encodeShareUrl therefore always busts the 32 KB cap for any session containing vision cases — even when the actual text payload would fit — and shows wildly inflated byte counts in the too-large message. It is also a size/privacy parity gap versus 'Export selected', which reads already-slimmed IDB records.
  FIX: Apply slimRows inside runStateToStored (export slimRows from history-store.ts or fold the stripping into runStateToStored), so the share/bundle payload always matches what putRun would persist.
- [minor] runStateToStored is presented as a trivial 'inverse of storedToRunState' but the two shapes don't mirror: ModelRunState.summary is BenchSummary (byTag: Map — JSON.stringify silently emits {}) vs StoredRun.summary: SerialisedSummary, and ModelRunState.finishedAt is number|null vs StoredRun.finishedAt: number. TS strict will flag both, but the design should specify the conversions so the data workstream doesn't loosen types to make it compile. Also the `(ModelRunState & RunMeta)` parameter type is redundant — ModelRunState already declares runId/sessionId/startedAt/finishedAt/runConfig (multi-bench-panel.tsx:55-63).
  FIX: Specify: runStateToStored(r: ModelRunState): StoredRun = { ...identity fields, finishedAt: r.finishedAt ?? Date.now(), phase: r.phase === 'queued' || r.phase === 'running' ? 'stopped' : r.phase, summary: serialiseSummary(r.summary), rows: slimRows(r.rows) } using the already-exported serialiseSummary (history-store.ts:282). Drop the & RunMeta from the signature.
- [minor] A1/A2/A4 reference `turnsClean` from three render sites (buildCase, the CardPreview chips 'driven by turnsClean.length', and implicitly the Try-it note) but the design shows it as a bare const attached to the buildCase snippet; if implemented inside buildCase it's out of scope for the preview chips and banner.
  FIX: Declare turnsClean as a component-level useMemo next to previewAccepts (case-edit-modal.tsx:329-339 is the exact pattern): const turnsClean = useMemo<readonly CaseTurn[]>(() => turns.map(t => ({ user: t.user })).filter(t => t.user.trim() !== ''), [turns]); use it in buildCase, CardPreview props, and the sandbox annotation (replacing the repeated turns.some/filter expressions).
- [minor] B7's signature `export function SharedRunCard({ onImported }: Props): JSX.Element | null` will not typecheck: @types/react ^19 (in package.json) removed the global JSX namespace, and no component in the codebase uses a JSX.Element return annotation.
  FIX: Drop the return-type annotation (match codebase style) or use React.JSX.Element | null.
- [minor] The import success banner can report a false positive: putRun swallows every failure by design (history-store.ts:137-147 best-effort catch — quota, private mode), so 'Imported N runs' shows emerald even when nothing was persisted; the imported runs then silently vanish on reload. Related cosmetic inconsistency: onRunsImported appends imported runs at the tail of `runs`, but the reload hydration path sorts all records by startedAt (local-models-shell.tsx:125-127), so imported foreign runs jump position after a refresh.
  FIX: Have the import path use a throwing variant of putRun (or have putRun return a boolean the import flow checks) and downgrade the banner to amber with 'imported into this view only — persistence failed' when writes fail. Sort by startedAt inside onRunsImported's merge so the in-session order matches the post-reload order.