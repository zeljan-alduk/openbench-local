/**
 * Per-runtime CORS recipes. Shared between the big CORS help panel
 * (shown when every probe failed) and the per-probe inline status
 * strip (shown when only some probes failed — e.g. Ollama is up but
 * blocking, while LM Studio is fine).
 *
 * Indexed by `DiscoverySource` so the probe-status component can
 * pull the right recipe without a switch.
 */

import type { DiscoverySource } from './discovery-direct';

export interface CorsRecipe {
  readonly runtime: string;
  readonly port: string;
  readonly command: string;
  readonly hint: string;
}

export const CORS_RECIPES: Readonly<Record<DiscoverySource, CorsRecipe>> = Object.freeze({
  ollama: {
    runtime: 'Ollama',
    port: '11434',
    command: 'OLLAMA_ORIGINS="*" ollama serve',
    hint: 'Restart Ollama with the env var. Set it permanently via launchctl on macOS or systemd unit on Linux.',
  },
  lmstudio: {
    runtime: 'LM Studio',
    port: '1234',
    command: 'Toggle "Enable CORS" in Local Server panel',
    hint: 'Server → Settings → "Enable CORS". No restart needed.',
  },
  vllm: {
    runtime: 'vLLM',
    port: '8000',
    command: 'vllm serve … --allowed-origins "*"',
    hint: 'Add to your serve command. Pass an exact host instead of `*` for production (the flag accepts a space-separated list).',
  },
  llamacpp: {
    runtime: 'llama.cpp',
    port: '8080',
    command: './llama-server … --http-cors-origin "*"',
    hint: 'Default allows localhost:8080 + 127.0.0.1:8080 only — you need this for any other origin.',
  },
});

export const RUNTIME_ORDER: readonly DiscoverySource[] = ['ollama', 'lmstudio', 'vllm', 'llamacpp'];
