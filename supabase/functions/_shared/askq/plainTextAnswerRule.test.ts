// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildMyK9ShowPrompt } from './myK9ShowPrompt.ts';
import { PLAIN_TEXT_ANSWER_RULE } from './plainTextAnswerRule.ts';
import { buildModePrompt } from './requestRouting.ts';
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

  it.each(['rules', 'show-data', 'app-help'] as const)(
    'reaches the %s mode prompt, and the support wrapper',
    mode => {
      const base = `${buildMyK9ShowPrompt(context, '')}${buildModePrompt(mode)}`;
      expect(base).toContain(PLAIN_TEXT_ANSWER_RULE);
      expect(buildSupportModePrompt(base, [])).toContain(PLAIN_TEXT_ANSWER_RULE);
    }
  );
});
