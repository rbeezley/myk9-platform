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

  it('returns nothing for text that is not a verdict', () => {
    expect(parseClassifierReply('')).toEqual([]);
    expect(parseClassifierReply('guides')).toEqual([]);
    expect(parseClassifierReply('{"sources":"guides"}')).toEqual([]);
  });
});

describe('classifyQuestionSources', () => {
  it('returns the verdict in join order', async () => {
    expect(await classify(replying('{"sources":["rulebook","guides"]}'))).toEqual([
      'guides',
      'rulebook',
    ]);
  });

  it('drops show_data without a verified show', async () => {
    expect(await classify(replying('{"sources":["show_data","guides"]}'), false)).toEqual([
      'guides',
    ]);
  });

  it('falls back to every applicable source on an unparseable reply, an empty set or a lone dropped source', async () => {
    expect(await classify(replying('no idea'))).toEqual(['show_data', 'guides', 'rulebook']);
    expect(await classify(replying('{"sources":[]}'))).toEqual(['show_data', 'guides', 'rulebook']);
    expect(await classify(replying('{"sources":["show_data"]}'), false)).toEqual([
      'guides',
      'rulebook',
    ]);
  });

  it('never fails the request when the call fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: ModelCall = async () => {
      throw new Error('503');
    };
    expect(await classify(failing)).toEqual(applicableSources(true));
    expect(await classify(failing, false)).toEqual(['guides', 'rulebook']);
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
