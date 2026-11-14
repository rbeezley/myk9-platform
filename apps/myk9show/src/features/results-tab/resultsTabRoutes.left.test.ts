import { describe, expect, it } from 'vitest';

import {
  getFinishLineHref,
  readResultsTabUrlState,
  writeResultsTabUrlState,
} from './resultsTabRoutes';

describe('the Finish the show line filter in the Results URL', () => {
  it('reads the line a link names', () => {
    expect(readResultsTabUrlState(new URLSearchParams('left=unreleased')).left).toBe('unreleased');
    expect(readResultsTabUrlState(new URLSearchParams('')).left).toBeNull();
  });

  it('builds the link a line opens', () => {
    expect(getFinishLineHref('show 1', 'akc-judge-initials')).toBe(
      '/shows/show%201/results?left=akc-judge-initials'
    );
  });

  it('is replaced when a status is picked, and cleared on request', () => {
    const picked = writeResultsTabUrlState(new URLSearchParams('left=unreleased'), {
      status: 'done',
    });
    expect(picked.has('left')).toBe(false);
    expect(picked.get('status')).toBe('done');

    const cleared = writeResultsTabUrlState(new URLSearchParams('left=unreleased'), { left: null });
    expect(cleared.has('left')).toBe(false);
  });
});
