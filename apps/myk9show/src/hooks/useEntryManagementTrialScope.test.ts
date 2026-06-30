import { describe, expect, it } from 'vitest';
import type { TrialEntryRow } from '@/hooks/queries/useTrialEntries';
import {
  buildEntryManagementBreadcrumbNames,
  buildEntryManagementRosterRows,
} from './useEntryManagementTrialScope';

function makeTrialEntry(overrides: Partial<TrialEntryRow>): TrialEntryRow {
  return {
    id: 'entry-1',
    class_id: 'class-1',
    entry_status: 'confirmed',
    check_in_status: null,
    is_scored: false,
    handler: null,
    armband: '101',
    created_at: null,
    dog: {
      id: 'dog-1',
      name: 'Registered Name',
      call_name: 'Beacon',
      breed: 'Border Collie',
      owner: {
        id: 'person-1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: null,
      },
    },
    class: {
      id: 'class-1',
      name: 'Novice A',
      class_number: null,
      entry_fee: null,
      trial_id: 'trial-1',
    },
    promo_code: null,
    ...overrides,
  };
}

describe('buildEntryManagementRosterRows', () => {
  it('maps trial entry rows into roster rows and applies the class filter', () => {
    const rows = [
      makeTrialEntry({ id: 'entry-1', class_id: 'class-1' }),
      makeTrialEntry({
        id: 'entry-2',
        class_id: 'class-2',
        dog: { id: 'dog-2', name: 'Second Dog', call_name: null, breed: null, owner: null },
        class: {
          id: 'class-2',
          name: 'Open B',
          class_number: null,
          entry_fee: null,
          trial_id: 'trial-1',
        },
      }),
    ];

    expect(buildEntryManagementRosterRows(rows, 'class-1')).toEqual([
      {
        id: 'entry-1',
        armband: '101',
        dogName: 'Beacon',
        breed: 'Border Collie',
        handlerName: 'Ada Lovelace',
        className: 'Novice A',
        classId: 'class-1',
        isScored: false,
        checkInStatus: null,
      },
    ]);
  });

  it('uses the explicit handler before owner fallback', () => {
    const [row] = buildEntryManagementRosterRows(
      [makeTrialEntry({ handler: 'Jamie Handler' })],
      null
    );

    expect(row.handlerName).toBe('Jamie Handler');
  });

  it('preserves a blank handler cell when the owner has no name', () => {
    const [row] = buildEntryManagementRosterRows(
      [
        makeTrialEntry({
          dog: {
            id: 'dog-blank-owner',
            name: 'Nameless Owner Dog',
            call_name: null,
            breed: null,
            owner: {
              id: 'person-empty',
              first_name: null,
              last_name: null,
              email: null,
            },
          },
        }),
      ],
      null
    );

    expect(row.handlerName).toBe('');
  });
});

describe('buildEntryManagementBreadcrumbNames', () => {
  it('builds trial and class labels from the active filters', () => {
    expect(
      buildEntryManagementBreadcrumbNames({
        trialFilter: 'trial-1',
        classFilter: 'class-1',
        trials: [{ id: 'trial-1', name: null, date: null, trial_number: 2 }],
        trialClasses: [{ id: 'class-1', name: 'Novice A' }],
      })
    ).toEqual({
      breadcrumbTrialName: 'Trial 2',
      breadcrumbClassName: 'Novice A',
    });
  });
});
