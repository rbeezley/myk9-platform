import { describe, expect, it } from 'vitest';
import { registrationToEntries } from '@/utils/registrationToEntries';
import { mapDbEntryToReportEntry, resolveReportHandlerName } from '@/lib/reports/reportUtils';
import { buildEmergencyPacketModel } from '@/features/emergency-trial-packet/emergencyTrialPacket';
import { CHECK_IN_COLUMNS } from '@/features/emergency-trial-packet/buildEmergencyTrialPacketPdf';
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
  /**
   * The last hop, not the first: `resolveReportHandlerName` only end-trims and
   * `mapDbEntryToReportEntry` copies `handler` straight through, so asserting
   * either alone is `expect(x).toBe(x)`. This runs the projection the printed
   * check-in sheet actually uses — DB row -> ReportEntry -> packet model ->
   * the check-in page's entry — and asserts the cell the Handler column reads
   * (LESSONS `last-hop-drop`).
   *
   * This is the packet path, which reads `entries.handler`. The separate
   * pipeline-print surface builds its handler from the dog's OWNER instead;
   * that is MYK9-603 and deliberately not touched here.
   */
  function checkInHandlerCells(handlerFromDb: string): string[] {
    const reportEntry = mapDbEntryToReportEntry(
      {
        id: 'entry-1',
        armband: '101',
        run_order: 1,
        check_in_status: null,
        section: null,
        is_scored: false,
        result_status: null,
        search_time_seconds: null,
        total_faults: null,
        final_placement: null,
      },
      'Ziva',
      'Belgian Malinois',
      resolveReportHandlerName(handlerFromDb),
      'DN12345678'
    );

    const model = buildEmergencyPacketModel({
      generatedAt: '2026-08-20T20:15:00.000Z',
      show: {
        id: 'show-1',
        name: 'Old School Scent Work Trial',
        clubName: 'Prairie Dog Club',
        organization: 'AKC',
        startDate: '2026-10-03',
        endDate: '2026-10-03',
      },
      trials: [
        {
          id: 'trial-1',
          date: '2026-10-03',
          name: 'Saturday Trial',
          trialNumber: '1',
          registryId: 'AKC',
        },
      ],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          classNumber: '101',
          displayOrder: 1,
          judgeName: 'Judge One',
          ringLabel: 'Ring 1',
          startTime: '08:00',
          timeLimitSeconds: 120,
          timeLimitArea2Seconds: null,
          timeLimitArea3Seconds: null,
          numAreas: null,
          numHides: null,
          distractionCount: null,
        },
      ],
      entries: [{ ...reportEntry, classId: 'class-1', trialId: 'trial-1' }],
    });

    const checkInPages = model.pages.filter(page => page.kind === 'check-in');
    expect(checkInPages.length).toBeGreaterThan(0);
    return checkInPages.flatMap(page => page.entries.map(e => e.handler));
  }

  it('prints the Handler column, so the cell below is actually rendered', () => {
    expect(CHECK_IN_COLUMNS.map(column => column.key)).toContain('handler');
  });

  it.each([SPACED, PUNCTUATED])('carries %s onto the check-in page entry', name => {
    expect(checkInHandlerCells(name)).toEqual([name]);
  });

  it('trims only the ends, never the interior space', () => {
    expect(checkInHandlerCells(`  ${SPACED}  `)).toEqual([SPACED]);
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
      armband: '101',
      entries: [
        {
          id: 'e1',
          trialId: 'trial-1',
          classId: 'c1',
          element: 'Container',
          level: 'Novice A',
          armband: '101',
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
