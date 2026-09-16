import { describe, expect, it } from 'vitest';
import { registrationToEntries } from '@/utils/registrationToEntries';
import { mapDbEntryToReportEntry, resolveReportHandlerName } from '@/lib/reports/reportUtils';
import { buildAKCScentWorkEntryFormValues } from '@/features/organization-forms/akcScentWorkEntryForm';
import { AKC_SCENT_WORK_ENTRY_FORM_FIELDS } from '@/features/organization-forms/akcScentWorkEntryFormFields';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';

/**
 * MYK9-567 round-trip pins.
 *
 * The handler name the exhibitor types is printed on the check-in sheet, the
 * running order, the catalog and the official registry entry form. The input
 * fix (HandlerSelectionDialog / PopoverTrigger) only matters if the spaced name
 * survives the hops between the field and the paper, so each hop is pinned here
 * on the real prop shape rather than assumed. No step trims interior
 * whitespace today; these assertions are what keeps that true.
 *
 * NOT covered here: the live database round trip. That was traced in code
 * (`registrationToEntries` -> `submitShowEntries` -> `submit_show_entries` RPC
 * `handler_name` -> `entries.handler`) but never executed against a real
 * project from this branch.
 */

const SPACED = 'Mariana Alexander';
const PUNCTUATED = "Mary-Jane O'Brien";

describe('MYK9-567 — handler name reaches the entry write payload intact', () => {
  it.each([SPACED, PUNCTUATED])('keeps %s on registrationToEntries output', name => {
    const classSelections: ClassSelectionData[] = [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ];
    const handlerAssignments: Record<string, HandlerInfo> = {
      [makeHandlerKey('dog-1', 'class-1')]: {
        handlerId: 'person-1',
        handlerName: name,
        isOwner: false,
      },
    };

    const entries = registrationToEntries('show-1', classSelections, handlerAssignments, [
      { id: 'class-1', entryFee: 25 },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.registrationData.handler).toBe(name);
  });
});

describe('MYK9-567 — handler name reaches the check-in sheet intact', () => {
  it.each([SPACED, PUNCTUATED])('resolves %s verbatim from entries.handler', name => {
    expect(resolveReportHandlerName(name)).toBe(name);
  });

  it('trims only the ends, never the interior space', () => {
    expect(resolveReportHandlerName(`  ${SPACED}  `)).toBe(SPACED);
  });

  it('lands the spaced name on the ReportEntry the check-in page renders', () => {
    const entry = mapDbEntryToReportEntry(
      {
        id: 'entry-1',
        armband: 101,
        run_order: 1,
        check_in_status: 'checked-in',
        section: null,
        is_scored: false,
        result_status: null,
        search_time_seconds: null,
        total_faults: null,
        final_placement: null,
      },
      'Ziva',
      'Belgian Malinois',
      resolveReportHandlerName(SPACED),
      'DN12345678'
    );

    expect(entry.handler).toBe(SPACED);
  });
});

describe('MYK9-567 — handler name reaches the registry entry form intact', () => {
  const trials: EntryFormTrial[] = [{ id: 'trial-1', date: '2026-04-12', trialNumber: 'Trial 1' }];

  function dogWithHandler(handler: string): EntryFormDog {
    return {
      dogId: 'dog-1',
      callName: 'Ziva',
      breed: 'Belgian Malinois',
      sex: 'Female',
      dateOfBirth: '2022-03-15',
      registration: {
        registeredName: 'Ziva of Oakwood',
        registrationNumber: 'DN12345678',
        organization: 'AKC',
      },
      owner: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        streetAddress: '456 Oak Ave',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75001',
        phone: '(214) 555-0123',
        email: 'sarah@example.com',
      },
      handler,
      armband: 101,
      entries: [
        {
          id: 'e1',
          trialId: 'trial-1',
          classId: 'c1',
          element: 'Container',
          level: 'Novice A',
          armband: 101,
          handler,
          submittedAt: '2026-04-01T12:00:00Z',
        },
      ],
    } as EntryFormDog;
  }

  it.each([SPACED, PUNCTUATED])('fills the AKC HandlerName field with %s', name => {
    const values = buildAKCScentWorkEntryFormValues({ dog: dogWithHandler(name), trials });
    expect(values.text?.[AKC_SCENT_WORK_ENTRY_FORM_FIELDS.handlerName]).toBe(name);
  });
});
