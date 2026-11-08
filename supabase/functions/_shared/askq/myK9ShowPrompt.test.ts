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

  it('tells the model a single-registry show is that registry and not to ask', () => {
    const context: UserContext = {
      userId: 'user-1',
      displayName: null,
      dogs: [],
      showId: 'show-1',
      showName: 'Heartland Scent Work Classic',
      showRegistries: ['AKC Scent Work'],
    };

    const prompt = buildMyK9ShowPrompt(context, '');

    expect(prompt).toContain('exactly one registry and sport: AKC Scent Work');
    expect(prompt).toContain('do not ask which registry or sport');
  });

  it('omits registry guidance when there is no verified show', () => {
    const context: UserContext = {
      userId: 'user-1',
      displayName: null,
      dogs: [],
      showId: null,
      showName: null,
      showRegistries: ['AKC Scent Work'],
    };

    expect(buildMyK9ShowPrompt(context, '')).not.toContain('exactly one registry');
  });
});
