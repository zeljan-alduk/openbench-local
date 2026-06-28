/**
 * Report export helpers for /local-models. Three surfaces:
 *
 *   - Markdown: human-friendly summary suitable for pasting into Slack
 *     / a PR description. One section per model, per-tag rollup,
 *     fixed-width case table.
 *   - JSON: structured dump of the runs state — model metadata,
 *     summary, per-row data including outputs and tool calls. For
 *     diff'ing across runs or piping into something else.
 *   - Print: triggers `window.print()`. The print stylesheet (Tailwind
 *     `print:` modifiers throughout the page) hides chrome and
 *     auto-expands rows, so the user can pick "Save as PDF" in the
 *     browser's print dialog.
 *
 * All three preserve the page's "nothing leaves localhost" promise —
 * downloads are blob URLs, no network round-trip.
 */

import type { RunConfig } from './bench-direct';
import type { ModelRunState } from './multi-bench-panel';
import { mergeRunConfig } from './per-model-config';
import { modelKey } from './selection';

/**
 * Report-export inputs. The runs + global runConfig are obvious; the
 * per-model map and the global enabled flag let the export surface
 * exactly what config produced each model's row, including the
 * effective merged config (global wins when enabled, else per-model).
 */
export interface ExportContext {
  readonly runs: readonly ModelRunState[];
  readonly globalConfig: RunConfig;
  readonly globalEnabled: boolean;
  readonly perModel: Readonly<Record<string, RunConfig>>;
}

/** Trigger a markdown-formatted report download. */
export function downloadMarkdown(ctx: ExportContext): void {
  if (ctx.runs.length === 0) return;
  const md = formatMarkdown(ctx);
  triggerDownload(md, fileName('md'), 'text/markdown');
}

/** Trigger a JSON dump download. */
export function downloadJson(ctx: ExportContext): void {
  if (ctx.runs.length === 0) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    suite: 'local-model-rating',
    globalConfig: ctx.globalConfig,
    globalConfigEnabled: ctx.globalEnabled,
    perModelConfig: ctx.perModel,
    runs: ctx.runs.map((r) => {
      const key = modelKey(r.model);
      const perModel = ctx.perModel[key] ?? null;
      return {
        model: r.model,
        phase: r.phase,
        warmUp: r.warmUp,
        summary: r.summary,
        rows: r.rows,
        effectiveRunConfig: mergeRunConfig(ctx.globalEnabled ? ctx.globalConfig : {}, perModel),
        perModelOverride: perModel,
      };
    }),
  };
  triggerDownload(JSON.stringify(payload, jsonReplacer, 2), fileName('json'), 'application/json');
}

/** Open the browser's print dialog. The user picks Save as PDF. */
export function openPrint(): void {
  if (typeof window === 'undefined') return;
  window.print();
}

/**
 * Trigger an interactive HTML report download. Self-contained: all
 * data + CSS + the tiny expand/collapse JS are inlined into a single
 * .html file the user can save and open in any browser. Native
 * `<details>` / `<summary>` give per-row collapse without
 * JavaScript; the inlined JS adds Expand-all / Collapse-all
 * convenience.
 */
export function downloadHtml(ctx: ExportContext): void {
  if (ctx.runs.length === 0) return;
  const html = formatHtml(ctx);
  triggerDownload(html, fileName('html'), 'text/html');
}

// ---------------------------------------------------------------------
// markdown format

function formatMarkdown(ctx: ExportContext): string {
  const { runs, globalConfig, globalEnabled, perModel } = ctx;
  const lines: string[] = [];
  lines.push('# openbench-local · benchmark report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`## Global generation parameters (${globalEnabled ? 'active' : 'inactive'})`);
  lines.push('');
  if (!globalEnabled) {
    lines.push('_Global override is OFF — only per-model settings were applied._');
    lines.push('');
  }
  lines.push('```');
  lines.push(formatConfigBlock(globalConfig));
  lines.push('```');
  lines.push('');

  // Show per-model overrides upfront so a reader sees the full
  // configuration picture before the per-model results.
  const perModelEntries = runs
    .map((r) => ({ key: modelKey(r.model), id: r.model.id, override: perModel[modelKey(r.model)] }))
    .filter((e): e is { key: string; id: string; override: RunConfig } => e.override !== undefined);
  if (perModelEntries.length > 0) {
    lines.push('## Per-model overrides');
    lines.push('');
    for (const e of perModelEntries) {
      lines.push(`### \`${e.id}\``);
      lines.push('');
      lines.push('```');
      lines.push(formatConfigBlock(e.override));
      lines.push('```');
      lines.push('');
    }
  }

  if (runs.length >= 2) {
    lines.push('## Comparison');
    lines.push('');
    lines.push('| Model | Source | Status | Pass | Avg tok/s | P95 latency |');
    lines.push('|-------|--------|--------|------|-----------|-------------|');
    for (const r of runs) {
      const s = r.summary;
      lines.push(
        `| \`${r.model.id}\` | ${r.model.source} | ${r.phase} | ${
          s === null ? '—' : `${s.passed}/${s.total} (${Math.round(s.passRate * 100)}%)`
        } | ${
          s === null || s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)
        } | ${s === null ? '—' : `${(s.p95LatencyMs / 1000).toFixed(1)} s`} |`,
      );
    }
    lines.push('');
  }

  for (const run of runs) {
    const key = modelKey(run.model);
    const override = perModel[key] ?? null;
    const effective = mergeRunConfig(globalEnabled ? globalConfig : {}, override);

    lines.push(`## ${run.model.id} (${run.model.source})`);
    lines.push('');
    lines.push(`Endpoint: \`${run.model.displayBaseUrl}\` · Status: **${run.phase}**`);
    if (run.warmUp !== null) {
      lines.push(
        `Warm-up: ${run.warmUp.ok ? `ok (${run.warmUp.ms} ms)` : `failed — ${run.warmUp.error ?? '?'}`}`,
      );
    }
    lines.push('');

    lines.push('### Effective parameters');
    lines.push('');
    lines.push('```');
    lines.push(formatConfigBlock(effective));
    lines.push('```');
    lines.push('');

    const s = run.summary;
    if (s !== null) {
      lines.push(
        `**Pass: ${s.passed}/${s.total} (${Math.round(s.passRate * 100)}%)** · ` +
          `avg tok/s: ${s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)} · ` +
          `p95 latency: ${(s.p95LatencyMs / 1000).toFixed(1)} s`,
      );
      lines.push('');
      const tags = Array.from(s.byTag.entries()).sort(
        ([, a], [, b]) => b.total - a.total || b.passed - a.passed,
      );
      if (tags.length > 0) {
        lines.push('### By tag');
        lines.push('');
        for (const [tag, t] of tags) {
          const pct = t.total === 0 ? 0 : Math.round((t.passed / t.total) * 100);
          lines.push(`- \`${tag}\` — ${t.passed}/${t.total} (${pct}%)`);
        }
        lines.push('');
      }
    }

    if (run.rows.length > 0) {
      lines.push('### Cases');
      lines.push('');
      lines.push('| Case | Result | Total | TTFT | Tok in | Tok out | Tok/s |');
      lines.push('|------|--------|-------|------|--------|---------|-------|');
      for (const row of run.rows) {
        const result = row.skipped
          ? `– skipped${row.skipReason !== undefined ? ` (${row.skipReason})` : ''}`
          : row.passed
            ? '✓ pass'
            : row.error !== undefined
              ? `! error: ${truncate(row.error, 40)}`
              : '✗ fail';
        lines.push(
          `| \`${row.id}\` | ${result} | ${fmtMs(row.totalMs)} | ${
            row.ttftMs === null ? '—' : fmtMs(row.ttftMs)
          } | ${row.tokensIn ?? '—'} | ${row.tokensOut ?? '—'} | ${
            row.tokPerSec === null ? '—' : row.tokPerSec.toFixed(1)
          } |`,
        );
      }
      lines.push('');
    }

    if (run.error !== null) {
      lines.push(`> Error: ${run.error}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(
    'Generated by [openbench-local](https://github.com/zeljan-alduk/openbench-local) · 100% client-side',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------
// helpers

function triggerDownload(content: string, filename: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so Safari doesn't cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileName(ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `aldo-local-models-${ts}.${ext}`;
}

/** Map → object for JSON serialisation; otherwise byTag is empty. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ---------------------------------------------------------------------
// HTML format (self-contained, interactive)
//
// One big template string. All CSS + the tiny expand/collapse JS are
// inlined. The data also lives inside a `<script type="application/
// json" id="report-data">` block so a future user can re-derive the
// report or feed it to another tool without re-running the bench.

function formatHtml(ctx: ExportContext): string {
  const { runs, globalConfig, globalEnabled, perModel } = ctx;
  const generated = new Date().toISOString();
  const dataPayload = {
    generatedAt: generated,
    suite: 'local-model-rating',
    globalConfig,
    globalConfigEnabled: globalEnabled,
    perModelConfig: perModel,
    runs: runs.map((r) => {
      const key = modelKey(r.model);
      const override = perModel[key] ?? null;
      return {
        model: r.model,
        phase: r.phase,
        warmUp: r.warmUp,
        summary: r.summary,
        rows: r.rows,
        effectiveRunConfig: mergeRunConfig(globalEnabled ? globalConfig : {}, override),
        perModelOverride: override,
      };
    }),
  };

  const body: string[] = [];
  body.push(`<header>
  <p class="kicker">openbench-local · benchmark report</p>
  <h1>Quality × speed report</h1>
  <p class="meta">Generated ${escapeHtml(generated)} · ${runs.length} model${runs.length === 1 ? '' : 's'}</p>
  <div class="controls">
    <button type="button" data-action="expand-all">Expand all</button>
    <button type="button" data-action="collapse-all">Collapse all</button>
    <button type="button" data-action="print">Print / save as PDF</button>
  </div>
</header>`);

  body.push(`<section class="config">
  <h2>Global generation parameters <span class="pill">${globalEnabled ? 'active' : 'inactive'}</span></h2>
  ${
    globalEnabled
      ? ''
      : '<p class="note">Override is OFF — only per-model settings were applied.</p>'
  }
  <pre>${escapeHtml(formatConfigBlock(globalConfig))}</pre>
</section>`);

  if (runs.length >= 2) {
    body.push('<section><h2>Comparison</h2>');
    body.push(
      '<table class="compare"><thead><tr><th>Model</th><th>Source</th><th>Status</th><th>Pass</th><th>Avg tok/s</th><th>P95 latency</th></tr></thead><tbody>',
    );
    for (const r of runs) {
      const s = r.summary;
      body.push(
        `<tr><td><code>${escapeHtml(r.model.id)}</code></td><td>${escapeHtml(r.model.source)}</td><td>${escapeHtml(r.phase)}</td><td>${
          s === null ? '—' : `${s.passed}/${s.total} (${Math.round(s.passRate * 100)}%)`
        }</td><td>${s === null || s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)}</td><td>${
          s === null ? '—' : `${(s.p95LatencyMs / 1000).toFixed(1)} s`
        }</td></tr>`,
      );
    }
    body.push('</tbody></table></section>');
  }

  for (const run of runs) {
    body.push(formatHtmlModelSection(run, ctx));
  }

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>openbench-local · benchmark report · ${escapeHtml(generated)}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${HTML_STYLE}</style>`,
    '</head>',
    '<body>',
    `<main>${body.join('\n')}</main>`,
    `<script type="application/json" id="report-data">${escapeJsonForScript(JSON.stringify(dataPayload, jsonReplacer))}</script>`,
    `<script>${HTML_SCRIPT}</script>`,
    '<footer>Generated by <a href="https://github.com/zeljan-alduk/openbench-local">openbench-local</a> · all data is local to this file</footer>',
    '</body>',
    '</html>',
  ].join('\n');
}

function formatHtmlModelSection(run: ExportContext['runs'][number], ctx: ExportContext): string {
  const key = modelKey(run.model);
  const override = ctx.perModel[key] ?? null;
  const effective = mergeRunConfig(ctx.globalEnabled ? ctx.globalConfig : {}, override);
  const s = run.summary;
  const out: string[] = [];
  out.push(`<section class="model" id="model-${escapeHtml(key)}">`);
  out.push(
    `<h2><code>${escapeHtml(run.model.id)}</code> <span class="pill pill-${run.phase}">${run.phase}</span></h2>`,
  );
  out.push(
    `<p class="meta">${escapeHtml(run.model.source)} · <code>${escapeHtml(run.model.displayBaseUrl)}</code>${
      run.warmUp !== null
        ? ` · warm-up ${run.warmUp.ok ? `ok ${run.warmUp.ms} ms` : `failed (${escapeHtml(run.warmUp.error ?? '?')})`}`
        : ''
    }</p>`,
  );

  if (s !== null) {
    out.push(
      `<div class="stats"><strong>${s.passed}/${s.total}</strong> pass (${Math.round(s.passRate * 100)}%) · avg tok/s ${
        s.avgTokPerSec === null ? '—' : s.avgTokPerSec.toFixed(1)
      } · p95 ${(s.p95LatencyMs / 1000).toFixed(1)} s</div>`,
    );
    const tags = Array.from(s.byTag.entries()).sort(
      ([, a], [, b]) => b.total - a.total || b.passed - a.passed,
    );
    if (tags.length > 0) {
      out.push('<details class="bytag" open><summary>By tag</summary><ul>');
      for (const [tag, t] of tags) {
        const pct = t.total === 0 ? 0 : Math.round((t.passed / t.total) * 100);
        out.push(
          `<li><span class="tag">${escapeHtml(tag)}</span> <span class="bar"><span class="fill" style="width:${pct}%"></span></span> <span class="num">${t.passed}/${t.total} · ${pct}%</span></li>`,
        );
      }
      out.push('</ul></details>');
    }
  }

  out.push('<details class="params"><summary>Effective parameters</summary>');
  out.push(`<pre>${escapeHtml(formatConfigBlock(effective))}</pre>`);
  if (override !== null) {
    out.push('<p class="note">Per-model override:</p>');
    out.push(`<pre>${escapeHtml(formatConfigBlock(override))}</pre>`);
  }
  out.push('</details>');

  if (run.rows.length > 0) {
    out.push('<h3>Cases</h3>');
    out.push('<div class="rows">');
    for (const row of run.rows) {
      out.push(formatHtmlRow(row));
    }
    out.push('</div>');
  }

  if (run.error !== null) {
    out.push(`<p class="error">${escapeHtml(run.error)}</p>`);
  }

  out.push('</section>');
  return out.join('\n');
}

function formatHtmlRow(row: import('./bench-direct').BenchCaseRow): string {
  const status = row.skipped
    ? { glyph: '–', cls: 'skip' }
    : row.passed
      ? { glyph: '✓', cls: row.remark !== undefined ? 'remark' : 'pass' }
      : row.error !== undefined
        ? { glyph: '!', cls: 'err' }
        : { glyph: '✗', cls: 'fail' };
  const meta: string[] = [];
  if (row.totalMs > 0) meta.push(fmtMs(row.totalMs));
  if (row.ttftMs !== null) meta.push(`ttft ${fmtMs(row.ttftMs)}`);
  if (row.tokPerSec !== null) meta.push(`${row.tokPerSec.toFixed(1)} tok/s`);
  const out: string[] = [];
  out.push(`<details class="row row-${status.cls}">`);
  out.push(
    `<summary><span class="glyph">${status.glyph}</span> <code>${escapeHtml(row.id)}</code> <span class="meta">${escapeHtml(meta.join(' · '))}</span>${
      row.skipped && row.skipReason !== undefined
        ? ` <span class="note">${escapeHtml(row.skipReason)}</span>`
        : ''
    }${row.error !== undefined ? ` <span class="note">${escapeHtml(row.error)}</span>` : ''}${
      row.passed && row.remark !== undefined
        ? ` <span class="note">${escapeHtml(row.remark)}</span>`
        : ''
    }</summary>`,
  );
  out.push('<div class="detail">');

  out.push(`<h4>Prompt</h4><pre>${escapeHtml(row.input)}</pre>`);
  if (row.imageDataUrl !== null) {
    out.push(
      `<h4>Image attachment</h4><img src="${row.imageDataUrl}" alt="prompt attachment" class="prompt-img">`,
    );
  }

  const expected = describeExpect(row.expect);
  out.push(
    `<h4>Expected <span class="meta">— ${escapeHtml(expected.subtitle)}</span></h4><pre>${escapeHtml(expected.body)}</pre>`,
  );

  if (row.output.length > 0) {
    out.push(`<h4>Output</h4><pre>${escapeHtml(row.output)}</pre>`);
  }
  if (row.toolCalls.length > 0) {
    out.push('<h4>Tool calls</h4><ul class="tool-calls">');
    for (const tc of row.toolCalls) {
      out.push(
        `<li><strong>${escapeHtml(tc.name || '(no name)')}</strong><pre>${escapeHtml(tc.argumentsRaw || '(no args)')}</pre></li>`,
      );
    }
    out.push('</ul>');
  }
  if (row.reasoningOutput.length > 0) {
    out.push(
      `<h4>Reasoning trace</h4><pre class="reasoning">${escapeHtml(row.reasoningOutput)}</pre>`,
    );
  }
  if (row.detail !== undefined) {
    out.push(
      `<h4>Evaluator detail</h4><pre>${escapeHtml(JSON.stringify(row.detail, null, 2))}</pre>`,
    );
  }

  out.push('</div></details>');
  return out.join('\n');
}

const HTML_STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --bg-alt: #f7f8fa;
  --fg: #0c1320;
  --fg-muted: #5b6577;
  --border: #e2e6ed;
  --accent: #1e6cf2;
  --pass: #1f9d4d;
  --fail: #d83a3a;
  --skip: #8a93a3;
  --warn: #c97a00;
  --code-bg: #f1f3f7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1116;
    --bg-alt: #161a21;
    --fg: #e6e9ef;
    --fg-muted: #98a0ad;
    --border: #2a2f38;
    --accent: #6aa3ff;
    --pass: #7ed99f;
    --fail: #ff7373;
    --skip: #98a0ad;
    --warn: #f6b34d;
    --code-bg: #1a1f27;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.5;
  font-size: 14px;
}
main { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
.kicker { text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px; color: var(--accent); margin: 0 0 4px; font-weight: 600; }
h1 { font-size: 28px; line-height: 1.2; margin: 0 0 6px; }
.meta { color: var(--fg-muted); font-size: 12px; margin: 0; }
.controls { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.controls button {
  font: inherit; cursor: pointer;
  background: var(--bg-alt); color: var(--fg);
  border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 12px;
}
.controls button:hover { border-color: var(--accent); color: var(--accent); }
section { margin-bottom: 28px; }
h2 { font-size: 18px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
h3 { font-size: 14px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-muted); }
h4 { font-size: 11px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-muted); }
pre {
  background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; margin: 0;
  white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--fg);
  max-height: 50vh;
  overflow: auto;
}
pre.reasoning { color: var(--fg-muted); }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95em;
  background: var(--code-bg); padding: 1px 4px; border-radius: 4px;
}
.pill {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
  background: var(--bg-alt); color: var(--fg-muted);
  border: 1px solid var(--border);
}
.pill-done { background: rgba(31,157,77,0.15); color: var(--pass); border-color: transparent; }
.pill-error { background: rgba(216,58,58,0.15); color: var(--fail); border-color: transparent; }
.pill-stopped { background: rgba(201,122,0,0.15); color: var(--warn); border-color: transparent; }
.pill-running { background: rgba(30,108,242,0.15); color: var(--accent); border-color: transparent; }
.note { color: var(--warn); font-size: 12px; margin: 4px 0; }
.error { color: var(--fail); font-size: 12px; }
.stats { font-size: 13px; color: var(--fg-muted); margin: 8px 0; }
.stats strong { color: var(--fg); font-size: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-muted); font-weight: 600; }
.rows { display: flex; flex-direction: column; gap: 4px; }
details { border: 1px solid var(--border); border-radius: 8px; background: var(--bg-alt); }
details + details { margin-top: 4px; }
details > summary {
  cursor: pointer; padding: 10px 12px; display: flex; align-items: center; gap: 10px;
  list-style: none; user-select: none;
}
details > summary::-webkit-details-marker { display: none; }
details > summary::before {
  content: "▸"; color: var(--fg-muted); font-size: 10px; width: 10px;
  transition: transform 0.15s ease;
}
details[open] > summary::before { transform: rotate(90deg); }
details > .detail { padding: 0 14px 14px; border-top: 1px solid var(--border); }
.row .glyph {
  display: inline-flex; width: 18px; height: 18px; border-radius: 50%;
  align-items: center; justify-content: center; font-weight: 700; font-size: 11px;
  background: var(--bg);
}
.row-pass .glyph { background: rgba(31,157,77,0.15); color: var(--pass); }
.row-remark .glyph { background: rgba(201,122,0,0.15); color: var(--warn); }
.row-fail .glyph { background: rgba(216,58,58,0.15); color: var(--fail); }
.row-err .glyph { background: rgba(201,122,0,0.15); color: var(--warn); }
.row-skip .glyph { background: var(--bg-alt); color: var(--fg-muted); border: 1px solid var(--border); }
.row .meta { color: var(--fg-muted); font-size: 11px; margin-left: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.row .note { color: var(--warn); font-size: 11px; }
.bytag ul { list-style: none; padding: 0; margin: 6px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
.bytag li { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.bytag .tag { width: 140px; flex-shrink: 0; color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.bytag .bar { flex: 1; height: 6px; background: var(--code-bg); border-radius: 999px; overflow: hidden; }
.bytag .bar .fill { display: block; height: 100%; background: var(--accent); }
.bytag .num { color: var(--fg-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; min-width: 90px; text-align: right; }
.tool-calls { list-style: none; padding: 0; margin: 4px 0; }
.tool-calls li { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 4px 0; }
.tool-calls strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.prompt-img { max-width: 320px; max-height: 240px; border: 1px solid var(--border); border-radius: 6px; }
footer { max-width: 980px; margin: 0 auto; padding: 16px 20px 32px; color: var(--fg-muted); font-size: 12px; border-top: 1px solid var(--border); }
@media print {
  body { background: white; color: black; }
  .controls { display: none; }
  details { break-inside: avoid; }
  details > summary::before { content: ""; }
  details:not([open]) > summary { /* collapsed kept collapsed; user opens before printing */ }
}
`;

const HTML_SCRIPT = `
(function () {
  function each(sel, fn) { document.querySelectorAll(sel).forEach(fn); }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t.nodeType === 1 && !t.dataset.action) t = t.parentNode;
    if (!t || !t.dataset || !t.dataset.action) return;
    if (t.dataset.action === 'expand-all') each('details', function (d) { d.open = true; });
    if (t.dataset.action === 'collapse-all') each('details', function (d) { d.open = false; });
    if (t.dataset.action === 'print') window.print();
  });
})();
`;

/**
 * Render the case's `expect` clause as a human-readable subtitle +
 * a body block. Mirrors the same describe-expect helper inside
 * bench-table.tsx so the in-page expand row and the HTML export
 * tell the same story.
 */
function describeExpect(expect: import('./bench-direct').BenchCaseRow['expect']): {
  subtitle: string;
  body: string;
} {
  switch (expect.kind) {
    case 'contains':
      return { subtitle: 'output must contain this string', body: expect.value };
    case 'not_contains':
      return { subtitle: 'output must NOT contain this string', body: expect.value };
    case 'regex':
      return { subtitle: 'output must match this regular expression', body: expect.value };
    case 'exact':
      return { subtitle: 'output (trimmed) must equal this exactly', body: expect.value };
    case 'json_schema':
      return {
        subtitle: 'output must parse as JSON and validate against this schema',
        body: JSON.stringify(expect.schema, null, 2),
      };
    case 'tool_call':
      return {
        subtitle:
          expect.argsSchema !== undefined
            ? `model must call tool "${expect.name}" with args matching this schema`
            : `model must call tool "${expect.name}" (any args accepted)`,
        body:
          expect.argsSchema !== undefined
            ? JSON.stringify(expect.argsSchema, null, 2)
            : `name = "${expect.name}"`,
      };
    default: {
      const _exhaust: never = expect;
      void _exhaust;
      return { subtitle: 'unknown evaluator', body: '' };
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape JSON for embedding inside a `<script>` block. The browser
 * stops at `</script>` regardless of JSON escaping, so we have to
 * neutralise that sequence (and similar HTML-context escapes).
 */
function escapeJsonForScript(s: string): string {
  return s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

/**
 * Render a RunConfig as a fixed-width key/value block. Only fields
 * that are explicitly set are rendered, plus a sensible default tail
 * for the always-on knobs (temperature, max_tokens, warm_up).
 */
function formatConfigBlock(c: RunConfig): string {
  const lines: string[] = [];
  lines.push(`temperature      ${c.temperature ?? '(default 0)'}`);
  lines.push(`max_tokens       ${c.maxTokens ?? '(default 1024)'}`);
  if (typeof c.topP === 'number') lines.push(`top_p            ${c.topP}`);
  if (typeof c.seed === 'number') lines.push(`seed             ${c.seed}`);
  if (c.reasoningEffort !== undefined) {
    lines.push(`reasoning_effort ${c.reasoningEffort}`);
  }
  lines.push(`warm_up          ${c.warmUp ?? '(default true)'}`);
  if (c.systemPrompt !== undefined && c.systemPrompt.trim().length > 0) {
    const oneLine = c.systemPrompt.replace(/\s+/g, ' ').trim();
    const preview = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
    lines.push(`system_prompt    "${preview}"`);
  }
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
