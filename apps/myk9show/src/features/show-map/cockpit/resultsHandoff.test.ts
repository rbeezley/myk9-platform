import { describe, expect, it } from 'vitest';

import { isEveryClassComplete } from './resultsHandoff';

describe('isEveryClassComplete (MYK9-1032)', () => {
  it('is false while any class is unfinished or unknown', () => {
    expect(isEveryClassComplete([{ lifecycle: 'complete' }, { lifecycle: 'in-progress' }])).toBe(
      false
    );
    expect(isEveryClassComplete([{ lifecycle: 'complete' }, { lifecycle: 'not-started' }])).toBe(
      false
    );
    expect(isEveryClassComplete([{ lifecycle: 'complete' }, { lifecycle: null }])).toBe(false);
  });

  it('is true once every class is complete, ignoring cancelled classes', () => {
    expect(isEveryClassComplete([{ lifecycle: 'complete' }, { lifecycle: 'complete' }])).toBe(true);
    expect(isEveryClassComplete([{ lifecycle: 'complete' }, { lifecycle: 'cancelled' }])).toBe(
      true
    );
  });

  it('is false with no classes, or only cancelled ones', () => {
    expect(isEveryClassComplete([])).toBe(false);
    expect(isEveryClassComplete([{ lifecycle: 'cancelled' }])).toBe(false);
  });
});
