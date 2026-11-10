// @vitest-environment node
// MYK9-1825 opt-in live check: calls the real classifier. Skipped in CI and anywhere
// ASKQ_LIVE_EVAL=1 and ANTHROPIC_API_KEY are not both set.
//   cd apps/myk9show && ASKQ_LIVE_EVAL=1 ANTHROPIC_API_KEY=... pnpm vitest run ../../supabase/functions/_shared/askq/sourceClassifier.live.test.ts
import { describe, expect, it } from 'vitest';
import { callClaude } from './promptBuilder.ts';
import { classifyQuestionSources, type AskQSource } from './sourceClassifier.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
const live = process.env.ASKQ_LIVE_EVAL === '1' && Boolean(apiKey);

interface LiveCase {
  question: string;
  hasVerifiedShow: boolean;
  expected: AskQSource[];
}

const CASES: LiveCase[] = [
  {
    question:
      "I can't make it to the show anymore. How do I drop my dog from the class, and do I get my money back?",
    hasVerifiedShow: true,
    expected: ['guides'],
  },
  {
    question: 'Someone walks up on show day wanting to enter. How do I add them?',
    hasVerifiedShow: true,
    expected: ['guides'],
  },
  {
    question: 'What is the maximum search time in Excellent Containers?',
    hasVerifiedShow: true,
    expected: ['rulebook'],
  },
  {
    question: 'How many dogs are entered in Master Interior?',
    hasVerifiedShow: true,
    expected: ['show_data'],
  },
  {
    question: 'Can I withdraw for in season, and how?',
    hasVerifiedShow: true,
    expected: ['guides', 'rulebook'],
  },
  { question: 'Is Novice Interior running yet?', hasVerifiedShow: true, expected: ['show_data'] },
  {
    question: 'Is my dog entered in Novice Interior?',
    hasVerifiedShow: true,
    expected: ['show_data'],
  },
  { question: 'Has my entry been cancelled?', hasVerifiedShow: true, expected: ['show_data'] },
];

describe.skipIf(!live)('AskQ source classifier (live model)', () => {
  it.each(CASES)('$question', async ({ question, hasVerifiedShow, expected }) => {
    const chosen = await classifyQuestionSources({
      message: question,
      hasVerifiedShow,
      showRegistries: ['AKC Scent Work'],
      call: (messages, tools, system, maxTokens) =>
        callClaude(messages, apiKey!, tools, system, maxTokens),
    });
    console.log(`LIVE ${JSON.stringify(question)} -> ${JSON.stringify(chosen)}`);
    expect(chosen).toEqual(expected);
  });
});
