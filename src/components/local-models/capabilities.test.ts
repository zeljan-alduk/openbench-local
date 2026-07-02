/**
 * Fixture tests for capability inference + engine-truth resolution.
 * Ids below are real tag spellings from Ollama and LM Studio — the
 * user-reported bug was exactly this list drifting from reality
 * (qwen2.5vl has no hyphen; gemma3 is vision except 1b/270m/gemma3n).
 */

import { describe, expect, it } from 'vitest';
import { inferCapabilities, resolveCapabilities } from './capabilities';

describe('inferCapabilities — vision', () => {
  it.each([
    ['qwen2.5vl:7b', true],
    ['qwen2.5-vl-7b-instruct', true],
    ['qwen3-vl:8b', true],
    ['llava:13b', true],
    ['llama3.2-vision:11b', true],
    ['moondream:latest', true],
    ['minicpm-v:8b', true],
    ['mistral-small3.1:24b', true],
    ['llama4:scout', true],
    ['gemma3:12b', true],
    ['gemma3:4b', true],
    // Text-only members of otherwise-multimodal families:
    ['gemma3:1b', false],
    ['gemma3:270m', false],
    ['gemma-3-1b-it', false],
    ['gemma3n:e4b', false],
    ['llama3.1:8b', false],
    ['qwen3:8b', false],
    ['deepseek-r1:14b', false],
  ])('%s → vision=%s', (id, want) => {
    expect(inferCapabilities(id).vision).toBe(want);
  });
});

describe('inferCapabilities — reasoning', () => {
  it.each([
    ['qwen3:8b', true],
    ['deepseek-r1:14b', true],
    ['gpt-oss:20b', true],
    ['qwq:32b', true],
    ['magistral:24b', true],
    ['marco-o1:7b', true],
    // 'o1' as an interior substring must NOT trigger (delimiter-guarded):
    ['solar-pro1:22b', false],
    ['llama3.1:8b', false],
  ])('%s → reasoning=%s', (id, want) => {
    expect(inferCapabilities(id).reasoning).toBe(want);
  });
});

describe('inferCapabilities — tool use & embedding', () => {
  it.each([
    ['llama3.1:8b', true],
    ['qwen2.5:14b', true],
    ['mistral:7b', true],
    ['smollm2:1.7b', true],
    ['gpt-oss:20b', true], // reasoning implies toolUse
    ['llama4:maverick', true],
  ])('%s → toolUse=%s', (id, want) => {
    expect(inferCapabilities(id).toolUse).toBe(want);
  });

  it('embedding models short-circuit all chat capabilities', () => {
    for (const id of ['nomic-embed-text', 'all-minilm:l6-v2', 'bge-m3', 'text-embedding-3-small']) {
      expect(inferCapabilities(id)).toEqual({
        vision: false,
        toolUse: false,
        reasoning: false,
        embedding: true,
      });
    }
  });
});

describe('resolveCapabilities — per-field engine merge', () => {
  it('no meta → all heuristic, all sources inferred', () => {
    const r = resolveCapabilities('llava:13b');
    expect(r.vision).toBe(true);
    expect(r.sources).toEqual({
      vision: 'inferred',
      toolUse: 'inferred',
      reasoning: 'inferred',
      embedding: 'inferred',
    });
  });

  it('engine flag wins per field; absent fields keep heuristic + inferred provenance', () => {
    // llama.cpp reports ONLY vision — toolUse must stay heuristic/inferred.
    const r = resolveCapabilities('some-mystery-model', { capabilities: { vision: true } });
    expect(r.vision).toBe(true);
    expect(r.sources.vision).toBe('engine');
    expect(r.sources.toolUse).toBe('inferred');
    expect(r.sources.reasoning).toBe('inferred');
  });

  it('an engine-reported false overrides a heuristic true', () => {
    const r = resolveCapabilities('llava:13b', { capabilities: { vision: false } });
    expect(r.vision).toBe(false);
    expect(r.sources.vision).toBe('engine');
  });

  it('full Ollama-style report marks all four fields engine-sourced', () => {
    const r = resolveCapabilities('gemma3:1b', {
      capabilities: { vision: false, toolUse: false, reasoning: false, embedding: false },
    });
    expect(r.sources).toEqual({
      vision: 'engine',
      toolUse: 'engine',
      reasoning: 'engine',
      embedding: 'engine',
    });
  });
});
