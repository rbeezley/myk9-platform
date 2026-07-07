import { describe, expect, it } from 'vitest';
import { registrationToEntries } from './registrationToEntries';

describe('registrationToEntries', () => {
  it('preserves handler id and display name for on-behalf entries', () => {
    const entries = registrationToEntries(
      'show-1',
      [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
        },
      ],
      {
        'dog-1|class-1': {
          handlerId: 'handler-person-1',
          handlerName: 'Grace Hollis',
          isOwner: false,
        },
      },
      [{ id: 'class-1', entryFee: 25 }],
      { preEntryFee: '30', dayOfShowFee: '35', startDate: '2026-09-01' }
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.registrationData).toEqual(
      expect.objectContaining({
        handler: 'Grace Hollis',
        handlerId: 'handler-person-1',
      })
    );
  });
});
