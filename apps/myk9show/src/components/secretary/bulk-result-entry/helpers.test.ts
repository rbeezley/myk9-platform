import { describe, expect, it } from 'vitest';
import { hasBulkEntryChanges, resolveBulkEntryValues } from './helpers';

const savedValues = {
  searchTime: '0:30.00',
  qualification: 'Qualified' as const,
  faults: '0',
  notes: '',
};

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

  it('preserves a dirty row while refreshed persisted values catch up', () => {
    expect(
      resolveBulkEntryValues(savedValues, {
        ...savedValues,
        qualification: 'Not Qualified',
        hasChanges: true,
      })
    ).toEqual({ ...savedValues, qualification: 'Not Qualified', hasChanges: true });
  });

  it('adopts refreshed persisted values for a clean row', () => {
    expect(
      resolveBulkEntryValues(
        { ...savedValues, qualification: 'Not Qualified' },
        { ...savedValues, hasChanges: false }
      )
    ).toEqual({ ...savedValues, qualification: 'Not Qualified' });
  });
});
