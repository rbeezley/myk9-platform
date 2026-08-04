import { describe, expect, it } from 'vitest';
import { hasBulkEntryChanges } from './helpers';

describe('hasBulkEntryChanges', () => {
  it('keeps a qualification-only edit dirty when saved qualification is absent', () => {
    expect(
      hasBulkEntryChanges(
        { searchTime: '', qualification: 'Not Qualified', faults: '0', notes: '' },
        { searchTime: '', qualification: 'Qualified', faults: '0', notes: '' }
      )
    ).toBe(true);
  });

  it('does not mark unchanged persisted values dirty after an entries refresh', () => {
    expect(
      hasBulkEntryChanges(
        { searchTime: '0:30.00', qualification: 'Qualified', faults: '1', notes: 'Good' },
        { searchTime: '30', qualification: 'Qualified', faults: '1', notes: 'Good' }
      )
    ).toBe(false);
  });
});
