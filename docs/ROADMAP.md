# Roadmap

What openbench-local deliberately does and doesn't do next. Shipped
work is documented in the README; this file tracks direction.

## Recently shipped (v1.0)

- **Engine-truth capability detection** — Ollama `/api/show`,
  LM Studio `/api/v0/models/{id}`, llama.cpp `/props` now decide the
  Vision / Tool Use gates; name heuristics are the fallback only.
  Chips show a check mark when the engine itself confirmed the flag.
- **Statistical rigor** — Wilson 95% CIs on every pass rate, error
  bars on the scatter, per-tag CI bands, and a Newcombe significance
  test against the leading run ("within noise" honesty).
- **Results that travel** — lossless run export/import
  (`openbench-run-v1` JSON) and summary-only share links
  (`#share=…`, deflate+base64url, nothing leaves the URL fragment).
- **Multi-turn + tool-loop cases** — scripted follow-up turns and
  canned tool responders with a real execution loop; transcripts in
  the row detail.
- **Context-length sweep** — one authored case expands to ~2k/8k/32k
  needle-in-haystack instances with a per-model degradation strip.
- **Quant A/B + Trends** — variant comparison with CI-backed
  verdicts, connector lines in the scatter, and a pass-rate-over-time
  chart across the persisted history.
- **~300-case suite** — tripled coverage, ≥60% parameterized against
  contamination, informed by 2025–26 gotcha research.
- **Vitest suite + CI gate**, **PWA/offline shell**.

## Next

- **Community leaderboard (opt-in)** — the deliberate omission. A
  static, GitHub-PR-based submission flow (run-export files reviewed
  into a `leaderboard/` dataset, rendered client-side) keeps the
  no-backend promise; a hosted variant would need infrastructure and
  is not planned until the submission format proves itself.
- **Embeddings benchmark** — embedding models are currently detected
  and excluded. A small retrieval-quality suite (needle ranking over
  a fixed corpus, cosine ordering checks) would bench them without an
  LLM judge.
- **Editor sub-forms for advanced cases** — followUps/toolResponders/
  sweep are authored via YAML today (preserved on save in the form);
  dedicated repeatable-row editors are a UX follow-up.
- **Suite growth in thin tags** — geometry, sequence, and spatial
  vision remain under-powered for per-tag CIs; grow toward n≥10 per
  tag.

## Non-goals

- **LLM-as-judge scoring.** Deterministic evaluators are the product.
- **Server-side anything.** The browser talks to loopback; reports
  are files; sharing is a URL fragment.
- **Parallel model execution.** Sequential runs keep tok/s honest on
  shared hardware.
