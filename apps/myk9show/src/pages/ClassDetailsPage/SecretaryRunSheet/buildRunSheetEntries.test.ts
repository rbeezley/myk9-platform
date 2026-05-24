import { describe, it, expect } from 'vitest';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

function makeRow(overrides: Partial<RawEntryRow> = {}): RawEntryRow {
  return {
    id: 'e1',
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband: '10',
    handler: 'Jane Smith',
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: null,
    run_order: 1,
    dog: {
      id: 'd1',
      name: 'Registered Rex',
      call_name: 'Rex',
      breed: 'Belgian Malinois',
      registrations: null,
      owner: { id: 'o1', first_name: 'Jane', last_name: 'Smith' },
    },
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('buildRunSheetEntries', () => {
  it('converts a basic row correctly', () => {
    const [e] = buildRunSheetEntries([makeRow()]);
    expect(e.id).toBe('e1');
    expect(e.dogName).toBe('Rex');
    expect(e.armband).toBe('10');
    expect(e.breed).toBe('Belgian Malinois');
    expect(e.handlerName).toBe('Jane Smith');
    expect(e.ownerName).toBe('Jane Smith');
    expect(e.checkInStatus).toBe('no-status');
    expect(e.isCheckedIn).toBe(false);
    expect(e.isScratched).toBe(false);
    expect(e.isScored).toBe(false);
    expect(e.result).toBeNull();
  });

  it('prefers call_name over name', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          dog: {
            id: 'd1',
            name: 'Registered Name',
            call_name: 'Buddy',
            breed: null,
            registrations: null,
            owner: null,
          },
        }),
      ]
    );
    expect(e.dogName).toBe('Buddy');
  });

  it('falls back to name when call_name is null', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          dog: {
            id: 'd1',
            name: 'Registered Name',
            call_name: null,
            breed: null,
            registrations: null,
            owner: null,
          },
        }),
      ]
    );
    expect(e.dogName).toBe('Registered Name');
  });

  it('uses 0 for runOrder when run_order is null', () => {
    const [e] = buildRunSheetEntries([makeRow({ run_order: null })]);
    expect(e.runOrder).toBe(0);
  });

  it('sets isCheckedIn when check_in_status is checked-in', () => {
    const [e] = buildRunSheetEntries([makeRow({ check_in_status: 'checked-in' })]);
    expect(e.checkInStatus).toBe('checked-in');
    expect(e.isCheckedIn).toBe(true);
    expect(e.isScratched).toBe(false);
  });

  it('sets isScratched when check_in_status is pulled', () => {
    const [e] = buildRunSheetEntries([makeRow({ check_in_status: 'pulled' })]);
    expect(e.checkInStatus).toBe('pulled');
    expect(e.isScratched).toBe(true);
    expect(e.isCheckedIn).toBe(false);
  });

  it('uses the show organization registered breed when available', () => {
    const [e] = buildRunSheetEntries(
      [makeRow()],
      new Map([
        [
          'd1',
          {
            id: 'd1',
            name: 'Registered Rex',
            breed: 'Mixed Breed',
            sex: 'male',
            ownerId: 'o1',
            registrations: [
              {
                id: 'reg-akc',
                organization: 'AKC',
                registeredName: 'Rex',
                breed: 'Belgian Tervuren',
                registrationNumber: 'AKC100',
                status: 'Active',
              },
            ],
          },
        ],
      ]),
      'AKC'
    );

    expect(e.breed).toBe('Belgian Tervuren');
  });

  it('builds a qualified result from a scored row', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 95.5,
          total_faults: 0,
          final_placement: 1,
          judge_notes: 'Good search',
        }),
      ]
    );
    expect(e.isScored).toBe(true);
    expect(e.result).not.toBeNull();
    expect(e.result!.qualified).toBe(true);
    expect(e.result!.timeStr).toBe('1:35.50');
    expect(e.result!.faults).toBe(0);
    expect(e.result!.placement).toBe(1);
    expect(e.result!.judgeNotes).toBe('Good search');
  });

  it('builds an NQ result with empty timeStr when no time recorded', () => {
    const [e] = buildRunSheetEntries(
      [makeRow({ is_scored: true, result_status: 'nq', search_time_seconds: null })]
    );
    expect(e.result!.qualified).toBe(false);
    expect(e.result!.timeStr).toBe('');
  });

  it('maps final_placement 0 to null', () => {
    const [e] = buildRunSheetEntries(
      [makeRow({ is_scored: true, result_status: 'qualified', final_placement: 0 })]
    );
    expect(e.result!.placement).toBeNull();
  });

  it('sorts by runOrder ascending', () => {
    const rows = [
      makeRow({ id: 'a', run_order: 3 }),
      makeRow({ id: 'b', run_order: 1 }),
      makeRow({ id: 'c', run_order: 2 }),
    ];
    expect(buildRunSheetEntries(rows).map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('builds ownerName from first + last', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          dog: {
            id: 'd1',
            name: 'Rex',
            call_name: null,
            breed: null,
            registrations: null,
            owner: { id: 'o1', first_name: 'John', last_name: 'Doe' },
          },
        }),
      ]
    );
    expect(e.ownerName).toBe('John Doe');
  });

  it('uses entry handler name for the visible handler', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          handler: 'Liz Beezley',
          dog: {
            id: 'd1',
            name: 'Ziva',
            call_name: null,
            breed: null,
            registrations: null,
            owner: { id: 'o1', first_name: 'Richard', last_name: 'Beezley' },
          },
        }),
      ]
    );
    expect(e.handlerName).toBe('Liz Beezley');
    expect(e.ownerName).toBe('Richard Beezley');
  });

  it('falls back to owner name when entry handler is blank', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          handler: '  ',
          dog: {
            id: 'd1',
            name: 'Ziva',
            call_name: null,
            breed: null,
            registrations: null,
            owner: { id: 'o1', first_name: 'Liz', last_name: 'Beezley' },
          },
        }),
      ]
    );
    expect(e.handlerName).toBe('Liz Beezley');
  });

  it('returns empty ownerName when owner is null', () => {
    const [e] = buildRunSheetEntries(
      [
        makeRow({
          dog: {
            id: 'd1',
            name: 'Rex',
            call_name: null,
            breed: null,
            registrations: null,
            owner: null,
          },
        }),
      ]
    );
    expect(e.ownerName).toBe('');
  });
});
