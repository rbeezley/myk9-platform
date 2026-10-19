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
      breed: '',
      handler: 'Jane Smith',
      trialDate: '6/11/2025',
      isDayOfShow: false,
    });
  });

  it('reads the text armband column as a number', () => {
    const raw = { id: 'e9', armband: '101', is_day_of_show: false, dog: null, class: null };
    expect(mapEntryToArmbandLabelEntry(raw)!.armband).toBe(101);
  });

  it('skips an armband that is not a number, as the Overview does', () => {
    const raw = { id: 'e10', armband: '101A', is_day_of_show: false, dog: null, class: null };
    expect(mapEntryToArmbandLabelEntry(raw)).toBeNull();
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

  // Same rule as the check-in sheet (projectHandlerIdentity, MYK9-570): the entry's handler as
  // entered, then the linked person, then the dog's owner.
  describe("prints the entry's handler, not the dog's owner", () => {
    const base = {
      id: 'e6',
      armband: 105,
      is_day_of_show: false,
      dog: { call_name: 'Storm', owner: { first_name: 'Jane', last_name: 'Owner' } },
      class: null,
    };

    it('uses the handler name entered on the entry', () => {
      const raw = {
        ...base,
        handler: '  Pat Handler ',
        handler_id: 'p1',
        handler_person: { first_name: 'Pat', last_name: 'Handler' },
      };
      expect(mapEntryToArmbandLabelEntry(raw)!.handler).toBe('Pat Handler');
    });

    it('uses the linked handler person when no name was entered', () => {
      const raw = {
        ...base,
        handler: null,
        handler_id: 'p1',
        handler_person: { first_name: 'Pat', last_name: 'Handler' },
      };
      expect(mapEntryToArmbandLabelEntry(raw)!.handler).toBe('Pat Handler');
    });

    it('falls back to the owner only when the entry names no handler', () => {
      const raw = { ...base, handler: ' ', handler_id: null, handler_person: null };
      expect(mapEntryToArmbandLabelEntry(raw)!.handler).toBe('Jane Owner');
    });

    it('prints no one rather than the owner when a linked handler cannot be read', () => {
      const raw = { ...base, handler: null, handler_id: 'p1', handler_person: null };
      expect(mapEntryToArmbandLabelEntry(raw)!.handler).toBe('');
    });
  });

  it("takes the breed from the registration with the trial's registry only", () => {
    const registrations = [
      { id: 'r1', organization: 'UKC', breed: 'UKC Breed', created_at: '2024-01-01' },
      { id: 'r2', organization: 'AKC', breed: 'Labrador Retriever', created_at: '2025-01-01' },
    ];
    const row = (registryId: string | null) => ({
      id: 'e8',
      armband: 107,
      is_day_of_show: false,
      dog: { call_name: 'Storm', breed: 'Dogs Table Breed', registrations },
      class: { id: 'c', trial: { id: 't', date: '2025-06-11', registry_id: registryId } },
    });
    expect(mapEntryToArmbandLabelEntry(row('AKC'))!.breed).toBe('Labrador Retriever');
    expect(mapEntryToArmbandLabelEntry(row('UKC'))!.breed).toBe('UKC Breed');
    // No registration with that registry: blank, never another registry's breed or dogs.breed.
    expect(mapEntryToArmbandLabelEntry(row('ASCA'))!.breed).toBe('');
  });
});
