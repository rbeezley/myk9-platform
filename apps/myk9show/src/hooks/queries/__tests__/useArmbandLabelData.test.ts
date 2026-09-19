import { mapEntryToArmbandLabelEntry } from '../useArmbandLabelData';

describe('mapEntryToArmbandLabelEntry', () => {
  it('maps a raw entry row to ArmbandLabelEntry shape', () => {
    const raw = {
      id: 'e1',
      dog_id: 'dog-1',
      armband: 101,
      is_day_of_show: false,
      dog: {
        call_name: 'Storm',
        owner: { first_name: 'Jane', last_name: 'Smith' },
      },
      class: { id: 'class-1', trial: { id: 'trial-1', date: '2025-06-11' } },
    };
    const result = mapEntryToArmbandLabelEntry(raw);
    expect(result).toEqual({
      id: 'e1',
      dogId: 'dog-1',
      trialId: 'trial-1',
      classId: 'class-1',
      calendarDay: '2025-06-11',
      armband: 101,
      callName: 'Storm',
      handler: 'Jane Smith',
      handlerIdentity: { id: null, name: 'Jane Smith', source: 'owner' },
      trialDate: '6/11/2025',
      isDayOfShow: false,
    });
  });

  it('prefers the assigned handler over the dog owner', () => {
    const result = mapEntryToArmbandLabelEntry({
      id: 'e-assigned',
      dog_id: 'dog-1',
      armband: 105,
      dog: { call_name: 'Storm', owner: { first_name: 'Jane', last_name: 'Smith' } },
      handler: 'Alex Assigned',
      handler_id: 'handler-1',
      handler_person: { first_name: 'Alex', last_name: 'Assigned' },
      class: { trial: { id: 'trial-1', date: '2025-06-11' } },
    });

    expect(result).toMatchObject({
      handler: 'Alex Assigned',
      handlerIdentity: { id: 'handler-1', name: 'Alex Assigned', source: 'assigned-text' },
    });
  });

  it('preserves suffixed armband labels instead of coercing them to numbers', () => {
    const result = mapEntryToArmbandLabelEntry({
      id: 'e-suffixed',
      dog_id: 'dog-1',
      armband: '12A',
      dog: { call_name: 'Storm', owner: null },
      class: null,
    });

    expect(result?.armband).toBe('12A');
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
