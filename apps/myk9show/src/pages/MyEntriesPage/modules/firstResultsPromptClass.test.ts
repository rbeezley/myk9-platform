import { describe, it, expect } from 'vitest';
import { firstResultsPromptClassId } from './firstResultsPromptClass';
import type { MyShowGroup } from './groupEntriesByShow';

function group(showId: string, classId: string): MyShowGroup {
  return {
    showId,
    orders: [],
    dogs: [
      {
        dogName: 'Juno',
        classes: [
          {
            id: classId,
            orderId: 'o-' + classId,
            isScored: true,
            resultsReleasedAt: '2026-11-17T00:00:00Z',
            finalPlacement: 1,
          },
        ],
      },
    ],
  } as unknown as MyShowGroup;
}

describe('firstResultsPromptClassId (MYK9-2174)', () => {
  const groups = [group('private-show', 'c1'), group('public-show', 'c2')];

  it('skips a club-private show so a later public show gets the prompt', () => {
    expect(firstResultsPromptClassId(groups, new Set(), false, new Set(['public-show']))).toBe(
      'c2'
    );
  });

  it('skips a show whose setting is unknown', () => {
    expect(firstResultsPromptClassId(groups, new Set(), false, new Set())).toBeNull();
  });

  it('still picks the first eligible show when both are public', () => {
    expect(
      firstResultsPromptClassId(groups, new Set(), false, new Set(['private-show', 'public-show']))
    ).toBe('c1');
  });
});
