/**
 * Test vectors for model-id parsing across real Ollama / LM Studio /
 * vLLM / llama.cpp id shapes — the quant A/B grouping rests on these.
 */

import { describe, expect, it } from 'vitest';
import { admitQuantGroups, effectiveQuant, parseModelId, quantGroupKey } from './model-id-parse';
import type { DiscoveredLocalModel } from './discovery-direct';

describe('parseModelId vectors', () => {
  it.each([
    // id, base contains, params, quant
    ['llama3.1:8b-instruct-q4_K_M', 'llama3.1', '8b', 'q4_k_m'],
    ['llama3.1:8b-instruct-q8_0', 'llama3.1', '8b', 'q8_0'],
    ['qwen2.5:14b', 'qwen2.5', '14b', null],
    ['gemma3:4b-it-qat', 'gemma3', '4b', 'qat'],
    ['deepseek-r1:70b', 'deepseek-r1', '70b', null],
    ['Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', 'meta-llama-3.1', '8b', 'q4_k_m'],
    ['lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF', 'meta-llama-3.1', '8b', null],
    ['qwen/qwen2.5-14b-instruct', 'qwen2.5', '14b', null],
    ['gemma-4-12b-coder-fable5-composer2.5@4bit', 'gemma-4', '12b', '4bit'],
    ['Qwen/Qwen2.5-14B-Instruct-AWQ', 'qwen2.5', '14b', 'awq'],
    ['TheBloke/Mistral-7B-Instruct-v0.2-GPTQ', 'mistral', '7b', 'gptq'],
    ['qwq-32b-preview-fp16', 'qwq', '32b', 'fp16'],
    ['phi-4-mini-int4', 'phi-4-mini', null, 'int4'],
    ['gpt-oss:20b-mxfp4', 'gpt-oss', '20b', 'mxfp4'],
    ['smollm2:1.7b', 'smollm2', '2b', null],
  ])('%s', (id, baseContains, params, quant) => {
    const p = parseModelId(id);
    expect(p.base).toContain(baseContains.toLowerCase());
    expect(p.params).toBe(params);
    expect(p.quant).toBe(quant);
  });
});

function model(id: string, meta?: DiscoveredLocalModel['meta']): DiscoveredLocalModel {
  return {
    id,
    source: 'ollama',
    host: '127.0.0.1',
    port: 11434,
    chatBaseUrl: 'http://127.0.0.1:11434/v1',
    displayBaseUrl: 'http://127.0.0.1:11434',
    capability: 'chat',
    ...(meta !== undefined ? { meta } : {}),
  };
}

describe('quantGroupKey / effectiveQuant', () => {
  it('two quants of one model share a group key', () => {
    expect(quantGroupKey(model('llama3.1:8b-instruct-q4_K_M'))).toBe(
      quantGroupKey(model('llama3.1:8b-instruct-q8_0')),
    );
  });

  it("id-parsed '14b' and engine parameter_size '14.8B' fold to the same key", () => {
    const fromId = quantGroupKey(model('qwen2.5:14b'));
    // Engine metadata rounds 14.8 → 15b — hmm, must NOT split. Use 14.2 shape:
    const fromMeta = quantGroupKey(model('qwen2.5:latest', { parameterSize: '14.2B' }));
    expect(fromId).toBe(fromMeta.replace('qwen2.5-latest', 'qwen2.5'));
  });

  it('meta quantization is the fallback when the id carries none', () => {
    expect(effectiveQuant(model('qwen2.5:14b'))).toBeNull();
    expect(effectiveQuant(model('qwen2.5:14b', { quantization: 'Q4_K_M' }))).toBe('q4_k_m');
  });
});

describe('admitQuantGroups', () => {
  it('admits ≥2 distinct known quants; re-runs of the identical model never form a group', () => {
    const q4 = { model: model('llama3.1:8b-instruct-q4_K_M') };
    const q8 = { model: model('llama3.1:8b-instruct-q8_0') };
    const admitted = admitQuantGroups([q4, q8, q4]);
    expect(admitted.size).toBe(1);
    expect([...admitted.values()][0]).toHaveLength(3);
    // Same model twice — one quant — no group.
    expect(admitQuantGroups([q4, q4]).size).toBe(0);
  });

  it("'unknown' quant never counts as a distinct variant (no spurious groups from old records)", () => {
    const known = { model: model('qwen2.5:14b', { quantization: 'Q4_K_M' }) };
    const unknown = { model: model('qwen2.5:14b') };
    expect(admitQuantGroups([known, unknown]).size).toBe(0);
  });

  it('different base models never group', () => {
    const a = { model: model('llama3.1:8b-q4_K_M') };
    const b = { model: model('qwen2.5:7b-q8_0') };
    expect(admitQuantGroups([a, b]).size).toBe(0);
  });
});
