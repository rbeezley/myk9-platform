import { mapEntryToArmbandLabelEntry } from '../useArmbandLabelData';

describe('mapEntryToArmbandLabelEntry', () => {
  it('maps a raw entry row to ArmbandLabelEntry shape', () => {
    const raw = {
      id: 'e1',
      armband: 101,
      is_day_of_show: false,
      dog: {
        call_name: 'Storm',
        owner: { first_name: 'Jane', last_name: 'Smith' },
      },
      class: { trial: { date: '2025-06-11' } },
    };
    const result = mapEntryToArmbandLabelEntry(raw);
    expect(result).toEqual({
      id: 'e1',
      armband: 101,
      callName: 'Storm',
      handler: 'Jane Smith',
      trialDate: '6/11/2025',
      isDayOfShow: false,
    });
  });

  it('returns null for entries without armband', () => {
    const raw = {
      id: 'e2',
      armband: null,
      is_day_of_show: false,
      dog: null,
      class: null,
    };
    expect(mapEntryToArmbandLabelEntry(raw)).toBeNull();
  });

  it('handles missing dog/owner gracefully', () => {
    const raw = {
      id: 'e3',
      armband: 102,
      is_day_of_show: true,
      dog: null,
      class: null,
    };
    const result = mapEntryToArmbandLabelEntry(raw);
    expect(result).not.toBeNull();
    expect(result!.callName).toBe('');
    expect(result!.handler).toBe('');
    expect(result!.isDayOfShow).toBe(true);
  });

  it('handles missing trial date gracefully', () => {
    const raw = {
      id: 'e4',
      armband: 103,
      is_day_of_show: false,
      dog: { call_name: 'Rex', owner: null },
      class: null,
    };
    const result = mapEntryToArmbandLabelEntry(raw);
    expect(result!.trialDate).toBe('');
  });

  it('formats date correctly', () => {
    const raw = {
      id: 'e5',
      armband: 104,
      is_day_of_show: false,
      dog: null,
      class: { trial: { date: '2025-12-25' } },
    };
    const result = mapEntryToArmbandLabelEntry(raw);
    expect(result!.trialDate).toBe('12/25/2025');
  });
});
