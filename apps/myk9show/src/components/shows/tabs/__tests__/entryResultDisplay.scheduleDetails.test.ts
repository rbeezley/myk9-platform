import { describe, expect, it } from 'vitest';
import { hasUnpublishedScheduleDetails } from '../entryResultDisplay';

/** MYK9-1853: a class with no judge yet still has schedule details to come. */
describe('hasUnpublishedScheduleDetails', () => {
  const published = { startTime: '09:00', armband: '101', judgeName: 'Jane Smith' };

  it('is false when time, armband and a real judge are all published', () => {
    expect(hasUnpublishedScheduleDetails([published])).toBe(false);
  });

  it.each([[''], [null], ['TBD']])('is true when the judge is unset (%j)', judgeName => {
    expect(hasUnpublishedScheduleDetails([{ ...published, judgeName }])).toBe(true);
  });
});
