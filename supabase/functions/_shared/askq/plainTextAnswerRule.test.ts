// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PLAIN_TEXT_ANSWER_RULE } from './plainTextAnswerRule.ts';
import { buildGuidesPrompt, buildRulebookPrompt, buildShowDataPrompt } from './sourcePrompts.ts';
import { buildSupportModePrompt } from './supportMode.ts';
import type { UserContext } from './types.ts';

const context: UserContext = {
  userId: 'user-1',
  displayName: null,
  dogs: [],
  showId: null,
  showName: null,
};

describe('AskQ plain-text answer rule (MYK9-1774)', () => {
  it('tells the model not to use Markdown', () => {
    expect(PLAIN_TEXT_ANSWER_RULE).toContain('plain text only');
    expect(PLAIN_TEXT_ANSWER_RULE).toContain("'1. ...'");
  });

  it('reaches every source prompt, and the support wrapper', () => {
    const prompts = [
      buildGuidesPrompt({ userContext: context, hasStaffRole: false, allGuides: [] }).systemPrompt,
      buildRulebookPrompt({ userContext: context, rulebooks: [] }),
      buildShowDataPrompt({ userContext: context }),
    ];
    for (const prompt of prompts) expect(prompt).toContain(PLAIN_TEXT_ANSWER_RULE);
    expect(buildSupportModePrompt(prompts[2], [])).toContain(PLAIN_TEXT_ANSWER_RULE);
  });
});
