// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  applicableSources,
  CLASSIFIER_SYSTEM_PROMPT,
  classifyQuestionSources,
  parseClassifierReply,
} from './sourceClassifier.ts';
import type { ModelCall } from './types.ts';

const replying =
  (text: string): ModelCall =>
  async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
const classify = (call: ModelCall, hasVerifiedShow = true) =>
  classifyQuestionSources({ message: 'q', hasVerifiedShow, showRegistries: [], call });

describe('parseClassifierReply', () => {
  it('reads plain JSON, fenced JSON and a bare array', () => {
    expect(parseClassifierReply('{"sources":["guides"]}')).toEqual(['guides']);
    expect(parseClassifierReply('```json\n{"sources":["rulebook","guides"]}\n```')).toEqual([
      'guides',
      'rulebook',
    ]);
    expect(parseClassifierReply('["show_data"]')).toEqual(['show_data']);
    expect(parseClassifierReply('Sure! {"sources":["show_data"]} hope that helps')).toEqual([
      'show_data',
    ]);
  });

  it('keeps only the three known strings', () => {
    expect(parseClassifierReply('{"sources":["guides","tools","RULEBOOK",7]}')).toEqual(['guides']);
  });

  it('returns null for text that is not a verdict, and [] for a verdict naming nothing', () => {
    expect(parseClassifierReply('')).toBeNull();
    expect(parseClassifierReply('guides')).toBeNull();
    expect(parseClassifierReply('{"sources":"guides"}')).toBeNull();
    expect(parseClassifierReply('{"sources":[]}')).toEqual([]);
    expect(parseClassifierReply('[]')).toEqual([]);
  });
});

describe('classifyQuestionSources', () => {
  it('returns the verdict in join order', async () => {
    expect(await classify(replying('{"sources":["rulebook","guides"]}'))).toEqual({
      sources: ['guides', 'rulebook'],
      needsShow: false,
    });
  });

  it('drops show_data without a verified show and says a show was wanted', async () => {
    expect(await classify(replying('{"sources":["show_data","guides"]}'), false)).toEqual({
      sources: ['guides'],
      needsShow: true,
    });
  });

  it('answers nothing, but reports needsShow, when show_data was the only choice and there is no show', async () => {
    expect(await classify(replying('{"sources":["show_data"]}'), false)).toEqual({
      sources: [],
      needsShow: true,
    });
  });

  it('treats a parsed reply that names no source as guides only', async () => {
    expect(await classify(replying('{"sources":[]}'))).toEqual({
      sources: ['guides'],
      needsShow: false,
    });
    expect(await classify(replying('{"sources":[]}'), false)).toEqual({
      sources: ['guides'],
      needsShow: false,
    });
  });

  it('falls back to every applicable source on an unparseable reply', async () => {
    expect(await classify(replying('no idea'))).toEqual({
      sources: ['show_data', 'guides', 'rulebook'],
      needsShow: false,
    });
    expect(await classify(replying('no idea'), false)).toEqual({
      sources: ['guides', 'rulebook'],
      needsShow: false,
    });
  });

  it('never fails the request when the call fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: ModelCall = async () => {
      throw new Error('503');
    };
    expect(await classify(failing)).toEqual({
      sources: applicableSources(true),
      needsShow: false,
    });
    expect(await classify(failing, false)).toEqual({
      sources: ['guides', 'rulebook'],
      needsShow: false,
    });
    spy.mockRestore();
  });

  it('sends a no-tools, small-budget call carrying the question and show context', async () => {
    const call = vi.fn<ModelCall>(replying('{"sources":["guides"]}'));
    await classifyQuestionSources({
      message: 'Is Novice Interior running yet?',
      hasVerifiedShow: true,
      showRegistries: ['AKC Scent Work'],
      call,
    });
    const [messages, tools, system, maxTokens] = call.mock.calls[0];
    expect(tools).toEqual([]);
    expect(system).toBe(CLASSIFIER_SYSTEM_PROMPT);
    expect(maxTokens).toBeLessThanOrEqual(100);
    expect(messages[0].content).toContain('Is Novice Interior running yet?');
    expect(messages[0].content).toContain('AKC Scent Work');
    expect(messages[0].content).toContain('verified show is in context: yes');
  });

  it('tells the classifier what each source is for, without sending users elsewhere', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toMatch(/THIS show's live state/);
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('Novice');
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('leaving a class');
    expect(CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/switch (to|modes|tabs)/i);
  });
});
