import { describe, expect, it } from 'vitest';

import { judgeSortValue } from '../classJudgeDisplay';

describe('judgeSortValue (MYK9-1853)', () => {
  it('is the trimmed name for a real judge', () => {
    expect(judgeSortValue(' Jane Smith ')).toBe('Jane Smith');
  });

  it('is undefined for null, blank and the legacy TBD so they sort last together', () => {
    for (const unset of [null, undefined, '', '  ', 'TBD']) {
      expect(judgeSortValue(unset)).toBeUndefined();
    }
  });
});
