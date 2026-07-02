/**
 * Conversation-loop tests for the runner — the multi-turn and
 * tool-execution paths, driven through runSingleCase with a mocked
 * fetch that replays canned SSE streams. Pins the wire protocol:
 * assistant echo shape, role:'tool' results with tool_call_id,
 * synthesized ids for engines that stream none, round caps, and the
 * single-request fast path for plain cases.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InlineCase } from './builtin-suite';
import { runSingleCase } from './bench-direct';

interface SentRequest {
  readonly url: string;
  readonly body: {
    readonly messages: ReadonlyArray<Record<string, unknown>>;
    readonly tools?: unknown;
  };
}

/** Build one SSE response from delta frames (adds usage + [DONE]). */
function sseResponse(deltas: ReadonlyArray<Record<string, unknown>>, usage?: object): Response {
  const frames = [
    ...deltas.map((delta) => ({ choices: [{ delta }] })),
    { choices: [], usage: usage ?? { prompt_tokens: 10, completion_tokens: 5 } },
  ];
  const body = `${frames.map((f) => `data: ${JSON.stringify(f)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Mock fetch to pop one canned response per request, recording bodies. */
function mockEngine(responses: Response[]): { sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as SentRequest['body'],
      });
      const next = responses.shift();
      if (next === undefined) throw new Error('mock engine: no more responses queued');
      return next;
    }),
  );
  return { sent };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = { modelId: 'test-model', chatBaseUrl: 'http://127.0.0.1:9999/v1' };

describe('single-turn fast path', () => {
  it('sends exactly one request and no transcript for a plain case', async () => {
    const { sent } = mockEngine([sseResponse([{ content: '42' }])]);
    const row = await runSingleCase({
      ...BASE,
      case: {
        id: 'plain',
        input: 'What is 6*7? Reply with ONLY the number.',
        expect: { kind: 'regex', value: '^42$' },
        weight: 1,
        tags: [],
      },
    });
    expect(sent).toHaveLength(1);
    expect(row.passed).toBe(true);
    expect(row.transcript).toBeUndefined();
    expect(sent[0]?.body.messages.map((m) => m.role)).toEqual(['user']);
  });
});

describe('multi-turn (followUps)', () => {
  const twoTurn: InlineCase = {
    id: 'mt',
    input: 'Remember the word "kumquat". Reply with OK.',
    followUps: ['What word did I ask you to remember? Reply with ONLY that word.'],
    expect: { kind: 'exact', value: 'kumquat' },
    weight: 1,
    tags: ['multi-turn'],
  };

  it('scripts the second user turn after echoing the assistant answer', async () => {
    const { sent } = mockEngine([
      sseResponse([{ content: 'OK' }]),
      sseResponse([{ content: 'kumquat' }]),
    ]);
    const row = await runSingleCase({ ...BASE, case: twoTurn });
    expect(sent).toHaveLength(2);
    const secondMessages = sent[1]?.body.messages ?? [];
    expect(secondMessages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(secondMessages[1]?.content).toBe('OK');
    expect(String(secondMessages[2]?.content)).toMatch(/What word/);
    // Evaluation is on the FINAL answer only.
    expect(row.passed).toBe(true);
    expect(row.output).toBe('kumquat');
    expect(row.transcript?.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('fails on the final answer even when intermediate turns were fine', async () => {
    mockEngine([sseResponse([{ content: 'OK' }]), sseResponse([{ content: 'banana' }])]);
    const row = await runSingleCase({ ...BASE, case: twoTurn });
    expect(row.passed).toBe(false);
  });
});

describe('tool-execution loop (toolResponders)', () => {
  const weatherTool = {
    type: 'function' as const,
    function: { name: 'get_weather', parameters: { type: 'object' } },
  };
  const loopCase: InlineCase = {
    id: 'tl',
    input: 'What is the temperature in Paris right now? Use the tool, then reply with ONLY the number.',
    tools: [weatherTool],
    toolResponders: [{ name: 'get_weather', response: '{"temp_c": 17}' }],
    expect: { kind: 'regex', value: '^17$' },
    weight: 1,
    tags: ['tool-use'],
    requires: 'tool_use',
  };

  it('feeds the canned tool result back and evaluates the final text', async () => {
    const { sent } = mockEngine([
      sseResponse([
        { tool_calls: [{ index: 0, id: 'call_abc', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }] },
      ]),
      sseResponse([{ content: '17' }]),
    ]);
    const row = await runSingleCase({ ...BASE, case: loopCase });
    expect(sent).toHaveLength(2);
    const second = sent[1]?.body.messages ?? [];
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    const assistantEcho = second[1] as { tool_calls?: Array<{ id: string; function: { name: string } }> };
    expect(assistantEcho.tool_calls?.[0]?.id).toBe('call_abc');
    const toolMsg = second[2] as { tool_call_id?: string; content?: unknown };
    expect(toolMsg.tool_call_id).toBe('call_abc');
    expect(toolMsg.content).toBe('{"temp_c": 17}');
    expect(row.passed).toBe(true);
    // The tool_call evaluator's data survives: calls from ALL rounds are unioned.
    expect(row.toolCalls.map((tc) => tc.name)).toEqual(['get_weather']);
    expect(row.transcript?.map((t) => t.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('synthesizes call ids when the engine streams none (llama.cpp)', async () => {
    const { sent } = mockEngine([
      sseResponse([
        { tool_calls: [{ index: 0, function: { name: 'get_weather', arguments: '{}' } }] },
      ]),
      sseResponse([{ content: '17' }]),
    ]);
    await runSingleCase({ ...BASE, case: loopCase });
    const toolMsg = (sent[1]?.body.messages ?? [])[2] as { tool_call_id?: string };
    expect(toolMsg.tool_call_id).toBe('call_0');
  });

  it('byArgs overrides pick the first matching rule', async () => {
    mockEngine([
      sseResponse([
        { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } }] },
      ]),
      sseResponse([{ content: '26' }]),
    ]);
    const row = await runSingleCase({
      ...BASE,
      case: {
        ...loopCase,
        toolResponders: [
          {
            name: 'get_weather',
            response: '{"temp_c": 17}',
            byArgs: [{ argsContains: 'Tokyo', response: '{"temp_c": 26}' }],
          },
        ],
        expect: { kind: 'regex', value: '^26$' },
      },
    });
    expect(row.passed).toBe(true);
  });

  it('stops at maxToolRounds even when the model keeps calling tools', async () => {
    const callFrame = () =>
      sseResponse([
        { tool_calls: [{ index: 0, id: 'x', function: { name: 'get_weather', arguments: '{}' } }] },
      ]);
    const { sent } = mockEngine([callFrame(), callFrame(), callFrame(), callFrame()]);
    const row = await runSingleCase({
      ...BASE,
      case: { ...loopCase, maxToolRounds: 3 },
    });
    // 3 rounds max — the 3rd response's calls are NOT fed back.
    expect(sent).toHaveLength(3);
    expect(row.passed).toBe(false);
  });

  it('a call with no matching responder ends the loop and is evaluated as-is', async () => {
    const { sent } = mockEngine([
      sseResponse([
        { tool_calls: [{ index: 0, id: 'c9', function: { name: 'unknown_tool', arguments: '{}' } }] },
      ]),
    ]);
    const row = await runSingleCase({ ...BASE, case: loopCase });
    expect(sent).toHaveLength(1);
    expect(row.passed).toBe(false);
    expect(row.toolCalls[0]?.name).toBe('unknown_tool');
  });
});
