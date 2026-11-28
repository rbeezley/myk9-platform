// @vitest-environment node
// MYK9-2472 owner decision A: a quote rejected as `quote_not_in_guide` gets exactly one retry
// that names the failed quote; every other rejection is not retried.
import { describe, expect, it } from 'vitest';
import { guideRefusalMarkers, refusalMarkers, retryMarkers } from './answerQuestion.ts';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { answerFromGuides } from './sourceAnswerers.ts';
import type { ClaudeMessage, ModelCall, UserContext } from './types.ts';

const userContext: UserContext = {
  userId: 'user-1',
  displayName: 'Pat',
  dogs: [],
  showId: null,
  showName: null,
  showRegistries: [],
};

const STEP_1 = 'Go to **My Dogs** in the navigation.';
const REWORDED = 'Navigate to the My Dogs page using the navigation menu on the left.';
const quoteLine = (passage: string) => `SUPPORT_QUOTE [exhibitor-guide]: "${passage}"`;
const answer = (...passages: string[]) => ['SUPPORT_ANSWER', ...passages.map(quoteLine)].join('\n');

function stub(replies: string[]) {
  const calls: Array<{ messages: ClaudeMessage[]; systemPrompt: string }> = [];
  const call: ModelCall = async (messages, _tools, systemPrompt) => {
    calls.push({ messages: [...messages], systemPrompt });
    const text = replies[calls.length - 1] ?? replies[replies.length - 1];
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  };
  return { call, calls };
}

const run = (call: ModelCall) =>
  answerFromGuides({
    call,
    message: 'How do I add my dog?',
    userContext,
    hasStaffRole: false,
    allGuides: ASKQ_GUIDES,
  });

describe('answerFromGuides quote retry (MYK9-2472)', () => {
  it('verifies a second answer that matches after a reworded first one', async () => {
    const first = answer(REWORDED);
    const { call, calls } = stub([first, answer(STEP_1)]);
    const result = await run(call);

    expect(calls).toHaveLength(2);
    expect(result.escalation).toBeNull();
    expect(result.guideSources.map(s => s.quote)).toEqual(['Go to My Dogs in the navigation.']);
    expect(result.retry).toBe('passed');
    const retryMessages = calls[1].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[0]).toEqual({ role: 'user', content: 'How do I add my dog?' });
    expect(retryMessages[1]).toEqual({ role: 'assistant', content: first });
    expect(retryMessages[2].role).toBe('user');
    expect(retryMessages[2].content).toContain(REWORDED);
    expect(calls[1].systemPrompt).toBe(calls[0].systemPrompt);
  });

  it('escalates after two failing answers, with exactly two calls', async () => {
    const { call, calls } = stub([answer(REWORDED), answer(REWORDED)]);
    const result = await run(call);

    expect(calls).toHaveLength(2);
    expect(result.escalation?.reason).toBe('low_confidence');
    expect(result.escalationDetail).toBe('quote_not_in_guide');
    expect(result.retry).toBe('failed');
  });

  it('keeps the first handoff when the retry request itself fails', async () => {
    let calls = 0;
    const call: ModelCall = async () => {
      calls += 1;
      if (calls === 2) throw new Error('rate limited');
      return { content: [{ type: 'text', text: answer(REWORDED) }], stop_reason: 'end_turn' };
    };
    const result = await run(call);

    expect(calls).toBe(2);
    expect(result.escalation?.reason).toBe('low_confidence');
    expect(result.escalationDetail).toBe('quote_not_in_guide');
    expect(result.retry).toBe('failed');
  });

  it.each([
    ['too many quotes', answer(STEP_1, STEP_1, STEP_1, STEP_1)],
    ['too short', answer('Go to My Dogs.')],
    ['handoff', 'SUPPORT_HANDOFF\nI need to get a person to help with that.'],
  ])('does not retry a %s rejection', async (_name, reply) => {
    const { call, calls } = stub([reply]);
    const result = await run(call);

    expect(calls).toHaveLength(1);
    expect(result.escalation).not.toBeNull();
    expect(result.retry).toBeNull();
  });

  it('makes one call and no retry when the first answer verifies', async () => {
    const { call, calls } = stub([answer(STEP_1)]);
    const result = await run(call);

    expect(calls).toHaveLength(1);
    expect(result.escalation).toBeNull();
    expect(result.retry).toBeNull();
  });
});

describe('retryMarkers', () => {
  it('logs that a retry happened and whether it passed', () => {
    expect(retryMarkers(null)).toEqual([]);
    expect(retryMarkers('passed')).toEqual(['support_quote_retry', 'support_quote_retry_passed']);
    expect(retryMarkers('failed')).toEqual(['support_quote_retry']);
  });

  it('is part of what a question logs, on the passing path too', () => {
    const passed = {
      escalation: null,
      escalationCause: null,
      guideRefusal: null,
      guideRetry: 'passed' as const,
    };
    expect(refusalMarkers(passed)).toEqual(['support_quote_retry', 'support_quote_retry_passed']);
    const failed = {
      escalation: null,
      escalationCause: null,
      guideRefusal: { cause: 'quote_rejected' as const, detail: 'quote_not_in_guide' as const },
      guideRetry: 'failed' as const,
    };
    expect(refusalMarkers(failed)).toEqual([
      ...guideRefusalMarkers(failed.guideRefusal),
      'support_quote_retry',
    ]);
  });
});
