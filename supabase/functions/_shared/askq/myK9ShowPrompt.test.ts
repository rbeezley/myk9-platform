import { describe, expect, it } from 'vitest';
import { buildMyK9ShowPrompt } from './myK9ShowPrompt.ts';
import type { UserContext } from './types.ts';

describe('AskQ user context', () => {
  it('uses the required call name when the legacy dog name is null', () => {
    const dogWithNullLegacyName = {
      id: 'dog-1',
      name: null,
      callName: 'Tera',
      breed: 'Border Collie',
    };
    const context: UserContext = {
      userId: 'user-1',
      displayName: null,
      dogs: [dogWithNullLegacyName],
      showId: null,
      showName: null,
    };

    const prompt = buildMyK9ShowPrompt(context, '');

    expect(prompt).toContain('Their dogs: Tera (breed: Border Collie).');
    expect(prompt).not.toContain('registered:');
  });
});
