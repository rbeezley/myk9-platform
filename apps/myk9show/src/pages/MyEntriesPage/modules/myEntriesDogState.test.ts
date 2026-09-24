import { describe, expect, it } from 'vitest';
import { deriveMyEntriesDogState } from './myEntriesDogState';

describe('deriveMyEntriesDogState', () => {
  it('does not expose the previous account dog or positive ownership during a switch', () => {
    expect(
      deriveMyEntriesDogState({
        ownerId: 'person-B',
        dogs: [{ id: 'dog-A' }],
        isLoading: false,
        isPlaceholderData: true,
      })
    ).toEqual({
      dogs: [],
      hasDogs: undefined,
      currentUserPersonId: 'person-B',
    });
  });

  it('uses settled dogs and the current owner for the page and dialog', () => {
    expect(
      deriveMyEntriesDogState({
        ownerId: 'person-B',
        dogs: [{ id: 'dog-B' }],
        isLoading: false,
        isPlaceholderData: false,
      })
    ).toEqual({
      dogs: [{ id: 'dog-B' }],
      hasDogs: true,
      currentUserPersonId: 'person-B',
    });
  });
});
