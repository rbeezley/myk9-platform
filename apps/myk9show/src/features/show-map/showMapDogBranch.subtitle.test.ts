import { describe, expect, it } from 'vitest';

import { dogEntrySubtitle } from './showMapDogBranch';

const display = { entryId: 'e1', classLabel: 'Container Novice', trialLabel: 'Trial 1' };

describe('dogEntrySubtitle unset judge (MYK9-1846)', () => {
  it('prints a real judge name as is', () => {
    expect(dogEntrySubtitle({ ...display, judgeName: 'Pat Lee', startTime: '9:00 AM' })).toBe(
      'Trial 1 · Pat Lee · 9:00 AM'
    );
  });

  it('prints Judge to be announced for a stored TBD', () => {
    expect(dogEntrySubtitle({ ...display, judgeName: 'TBD' })).toBe(
      'Trial 1 · Judge to be announced'
    );
  });

  it('omits the judge when the name is empty', () => {
    expect(dogEntrySubtitle({ ...display, judgeName: undefined })).toBe('Trial 1');
  });
});
