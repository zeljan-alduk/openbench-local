'use client';

/**
 * Engine-specific setup reference. The /local-models page can't
 * configure the engine itself — load-time settings (GPU offload, KV
 * cache, max context) are not in the OpenAI-compat HTTP wire and
 * have to be set in the engine's own UI / CLI / env. This component
 * collects the relevant knobs and copy-pasteable invocations per
 * engine, gathered from official docs as of 2026-05.
 *
 * Triggered by the "Setup tips" disclosure on each model card,
 * scoped to the model's `source`.
 */

import { useState } from 'react';
import { CopyableCommand } from './copyable-command';
import type { DiscoverySource } from './discovery-direct';

interface Tip {
  readonly label: string;
  readonly body: string;
  readonly cmd?: string;
}

interface EngineGuide {
  readonly title: string;
  readonly headline: string;
  readonly docsUrl: string;
  readonly knobs: ReadonlyArray<Tip>;
  readonly recommended?: ReadonlyArray<Tip>;
}

const GUIDES: Readonly<Record<DiscoverySource, EngineGuide>> = {
  ollama: {
    title: 'Ollama',
    headline:
      "Ollama loads models on demand. Most knobs live in env vars (OLLAMA_*) read at server start, or in a Modelfile per model. The native /api/chat path also accepts an `options` field for per-request overrides — Ollama's OpenAI-compat layer does not pass them through, so Modelfile / env is the reliable surface.",
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/modelfile.md',
    knobs: [
      {
        label: 'Keep model in memory',
        body: "OLLAMA_KEEP_ALIVE controls how long a model stays loaded after the last request. Set to -1 for benchmarking so warm-up isn't paid twice.",
        cmd: 'export OLLAMA_KEEP_ALIVE=-1',
      },
      {
        label: 'Allow this page (CORS)',
        body: "OLLAMA_ORIGINS must include the origin you're viewing this page from. * works for local dev.",
        cmd: 'export OLLAMA_ORIGINS="*"',
      },
      {
        label: 'Concurrent requests per model',
        body: 'OLLAMA_NUM_PARALLEL bumps in-flight request slots. Default 1; 4 is a fine ceiling for benchmark comparisons.',
        cmd: 'export OLLAMA_NUM_PARALLEL=4',
      },
      {
        label: 'Models loaded simultaneously',
        body: 'OLLAMA_MAX_LOADED_MODELS lets you compare without re-loading. Default 1 per GPU; raise to fit your VRAM.',
        cmd: 'export OLLAMA_MAX_LOADED_MODELS=2',
      },
      {
        label: 'Per-model context length / GPU layers',
        body: 'For a model `qwen3:14b`, override defaults with a Modelfile then re-create:',
        cmd: [
          'cat > /tmp/qwen3-bench <<EOF',
          'FROM qwen3:14b',
          'PARAMETER num_ctx 32768',
          'PARAMETER num_gpu 99',
          'EOF',
          'ollama create qwen3-bench -f /tmp/qwen3-bench',
        ].join('\n'),
      },
    ],
    recommended: [
      {
        label: 'Recommended start command (full bench)',
        body: "Restart Ollama with these env vars in scope, then it's ready for /local-models.",
        cmd: [
          'export OLLAMA_KEEP_ALIVE=-1 \\',
          '       OLLAMA_ORIGINS="*" \\',
          '       OLLAMA_NUM_PARALLEL=4 \\',
          '       OLLAMA_MAX_LOADED_MODELS=2',
          'ollama serve',
        ].join('\n'),
      },
    ],
  },

  lmstudio: {
    title: 'LM Studio',
    headline:
      "LM Studio's load-time settings (Context Length, GPU Offload, KV Cache, Evaluation Batch Size, Max Concurrent Predictions, RoPE) are configured in the desktop app's Load Model dialog and are NOT controllable over the HTTP API. The /v1/chat/completions endpoint only honours per-request generation params (temperature, max_tokens, etc.), which the Setup panel above already exposes.",
    docsUrl: 'https://lmstudio.ai/docs/local/start',
    knobs: [
      {
        label: 'Enable the local server',
        body: 'Open LM Studio → Developer tab (the </> icon on the sidebar) → toggle "Status" to running. Default port is 1234.',
      },
      {
        label: 'Allow this page (CORS)',
        body: 'In the Developer tab, enable "CORS" so the browser can reach the server from a different origin.',
      },
      {
        label: 'Load with custom settings',
        body: 'Open the Chat tab → click "Select a model to load" at the top → click the gear/settings icon next to the model → toggle "Show advanced settings". Recommended for benchmarking:',
      },
      {
        label: 'Context Length',
        body: "Set to the largest the model claims to support (or 32K-64K to keep memory reasonable). The page's long-context-recall case sends ~9 KB of tokens; bigger budgets give the model more headroom.",
      },
      {
        label: 'GPU Offload',
        body: 'Set to "Auto" or push to max. If you hit OOM during load, reduce by 4-8 layers at a time. Apple Silicon: leave on "Auto".',
      },
      {
        label: 'Keep Model in Memory',
        body: 'Toggle ON for benchmarking. With this off, the model unloads after each idle period and case 1 of every model pays cold-load cost.',
      },
      {
        label: 'Auto Unload If Idle (TTL)',
        body: 'Toggle OFF for benchmarking. Keeps state consistent across the run.',
      },
      {
        label: 'Evaluation Batch Size',
        body: '512 is a sane default. Reduce if prompt processing OOMs. Larger = faster prompt ingestion.',
      },
      {
        label: 'Max Concurrent Predictions',
        body: "1 for single-user testing (matches the bench's sequential model loop). Higher only if you plan to serve real traffic from this instance.",
      },
      {
        label: 'Unified KV Cache (experimental)',
        body: 'Optional. Enables shared KV across requests for memory savings on supported models. Safe to leave on.',
      },
      {
        label: 'Remember settings for <model>',
        body: 'Toggle ON before clicking Load — your benchmark profile is reused next session without re-tweaking.',
      },
    ],
    recommended: [
      {
        label: 'Recommended profile (benchmarking)',
        body: 'In the Load Model dialog, before pressing Load:',
        cmd: [
          '✓ Show advanced settings',
          'Context Length          → max supported (or 32-64K)',
          'GPU Offload             → Auto / Max',
          'Keep Model in Memory    → ON',
          'Auto Unload If Idle     → OFF',
          'Evaluation Batch Size   → 512',
          'Max Concurrent Pred     → 1',
          'Remember settings for…  → ON',
        ].join('\n'),
      },
    ],
  },

  vllm: {
    title: 'vLLM',
    headline:
      'vLLM is server-start configured via CLI flags. Per-request overrides for sampling work via the OpenAI-compat path; the bigger knobs (max model length, GPU memory utilisation, tool-call parser) have to be set when you launch `vllm serve`.',
    docsUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
    knobs: [
      {
        label: 'GPU memory utilisation',
        body: '--gpu-memory-utilization 0.9 lets vLLM use 90% of GPU memory. Drop to 0.7-0.8 if you share the GPU with other workloads.',
      },
      {
        label: 'Max model length',
        body: '--max-model-len 32768 caps the prompt+response length. Smaller = less KV cache memory; larger = supports the long-context-recall case.',
      },
      {
        label: 'Tensor parallel size',
        body: '--tensor-parallel-size 2 splits the model across 2 GPUs. Match to your physical GPU count.',
      },
      {
        label: 'Tool calling',
        body: "--enable-auto-tool-choice plus --tool-call-parser <hermes|llama3_json|qwen2_5_coder> based on your model family. Required for the bench's tool-call cases to pass.",
      },
      {
        label: 'CORS for this page',
        body: '--allowed-origins "*" or a specific origin so browser fetch from /local-models is permitted.',
      },
      {
        label: 'Quantisation',
        body: "--quantization awq | --quantization gptq | --quantization fp8 if your weights are quantised. Don't set if loading a full-precision checkpoint.",
      },
    ],
    recommended: [
      {
        label: 'Recommended start command (Qwen2.5-32B Instruct + tool calling)',
        body: 'Replace the model path with your HuggingFace repo or local path:',
        cmd: [
          'vllm serve Qwen/Qwen2.5-32B-Instruct \\',
          '  --gpu-memory-utilization 0.9 \\',
          '  --max-model-len 32768 \\',
          '  --enable-auto-tool-choice \\',
          '  --tool-call-parser hermes \\',
          '  --allowed-origins "*" \\',
          '  --port 8000',
        ].join('\n'),
      },
    ],
  },

  llamacpp: {
    title: 'llama.cpp',
    headline:
      'llama-server is configured via CLI flags at start. Per-request sampling params work over OpenAI-compat; everything else (context size, GPU layers, batch, parallel slots, CORS) has to be on the command line.',
    docsUrl: 'https://github.com/ggerganov/llama.cpp/blob/master/examples/server/README.md',
    knobs: [
      {
        label: 'Model file',
        body: '-m model.gguf points at the GGUF file to load. Use Q4_K_M / Q5_K_M / Q6_K builds for a balance of quality vs RAM.',
      },
      {
        label: 'Context length',
        body: '-c 32768 sets the context budget. Bigger = more KV cache memory.',
      },
      {
        label: 'GPU layers',
        body: '-ngl 99 offloads all layers to GPU. -ngl 0 keeps it on CPU. Reduce if you OOM.',
      },
      {
        label: 'Threads',
        body: '-t 8 sets CPU thread count for non-GPU layers. Match to physical cores; benching with -t 1 is interesting too.',
      },
      {
        label: 'Batch size',
        body: '-b 512 is a sane default. Larger = faster prompt processing if VRAM allows.',
      },
      {
        label: 'Parallel slots',
        body: '-np 4 lets the server handle 4 concurrent requests with shared KV cache.',
      },
      {
        label: 'CORS for this page',
        body: '--api-cors "*" enables cross-origin requests from your browser. Without this, the page can\'t reach the server.',
      },
    ],
    recommended: [
      {
        label: 'Recommended start command',
        body: 'Adjust paths and ngl/ctx for your hardware:',
        cmd: [
          './llama-server \\',
          '  -m ./qwen3-14b-q4_k_m.gguf \\',
          '  -c 32768 \\',
          '  -ngl 99 \\',
          '  -t 8 \\',
          '  -b 512 \\',
          '  -np 4 \\',
          '  --host 0.0.0.0 --port 8080 \\',
          '  --api-cors "*"',
        ].join('\n'),
      },
    ],
  },
};

interface Props {
  readonly source: DiscoverySource;
}

export function EngineSetupTips({ source }: Props) {
  const guide = GUIDES[source];
  const [open, setOpen] = useState(false);
  if (guide === undefined) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-subtle/40 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          Setup tips · {guide.title}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-fg-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path
            d="M4 2 L8 6 L4 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <p className="text-[12px] leading-relaxed text-fg-muted">{guide.headline}</p>

          {guide.recommended !== undefined && guide.recommended.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                Recommended
              </h4>
              {guide.recommended.map((tip) => (
                <TipBlock key={tip.label} tip={tip} />
              ))}
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
              All knobs
            </h4>
            {guide.knobs.map((tip) => (
              <TipBlock key={tip.label} tip={tip} compact />
            ))}
          </section>

          <p className="text-[11px] text-fg-muted">
            Source:{' '}
            <a
              href={guide.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {guide.docsUrl} ↗
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TipBlock({ tip, compact }: { tip: Tip; compact?: boolean }) {
  return (
    <div className="rounded border border-border bg-bg px-3 py-2">
      <p className={`font-semibold text-fg ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
        {tip.label}
      </p>
      <p
        className={`mt-1 leading-relaxed text-fg-muted ${compact ? 'text-[11px]' : 'text-[12px]'}`}
      >
        {tip.body}
      </p>
      {tip.cmd !== undefined ? (
        <div className="mt-2">
          <CopyableCommand command={tip.cmd} />
        </div>
      ) : null}
    </div>
  );
}
