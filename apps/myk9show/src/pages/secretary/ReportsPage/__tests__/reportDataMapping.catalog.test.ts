/**
 * MYK9-1009 last-hop check: every field the AKC marked catalog prints must
 * survive the projection from the hydrated database entry to `ReportEntry`
 * (LESSONS `last-hop-drop`). A pure function test cannot see a field dropped by
 * a hand-picked `.map(...)`, so this drives the real chain: Supabase row ->
 * rowToEntry -> mapReplicatedEntryToDbRow -> hydrated dog -> mapScopedReportEntries.
 */
import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { buildShowReportProps, mapScopedReportEntries } from '../reportDataMapping';
import { reportRegistry } from '@/lib/reports/reportRegistry';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const trial = fromAny<DbTrial, unknown>({
  id: 'trial-1',
  date: '2026-04-12',
  registry_id: 'AKC',
  trial_number: '1',
});
const cls = fromAny<DbClass, unknown>({
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Buried',
  level: 'Novice',
  time_limit_seconds: 180,
});
const show = { id: 'show-1', name: 'Spring Trial', organization: 'AKC' } as Show;

function hydratedEntry(
  entryRow: Record<string, unknown>,
  owner: Record<string, unknown> | null,
  handlerText: string | null
): ReportDbEntry {
  const replicated = rowToEntry({
    id: 'entry-1',
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: '101',
    entry_status: 'confirmed',
    handler: handlerText,
    ...entryRow,
  } as Parameters<typeof rowToEntry>[0]);
  const row = mapReplicatedEntryToDbRow(replicated, {
    dog: { id: 'dog-1', name: 'Buddy', callName: 'Buddy', breed: 'Golden Retriever' },
  }) as unknown as ReportDbEntry;
  return {
    ...row,
    dog: {
      ...row.dog,
      date_of_birth: '2020-03-05',
      registrations: [
        {
          organization: 'AKC (American Kennel Club)',
          registration_number: 'SS12345601',
          registered_name: 'Sunny Meadow Buddy Holly',
        },
        {
          organization: 'UKC',
          registration_number: 'UKC999',
          registered_name: 'Wrong Registry Name',
        },
      ],
      owner,
    },
  };
}

const owner = {
  first_name: 'Jane',
  last_name: 'Mitchell',
  street_address: '12 Oak Lane',
  city: 'Austin',
  state: 'TX',
  zip_code: '78701',
};

function mapOne(db: ReportDbEntry) {
  return mapScopedReportEntries([db], [trial], [cls], { kind: 'show', showId: 'show-1' })[0]!;
}

describe('AKC marked catalog fields reach ReportEntry', () => {
  it('carries registered name, birth date, owner name and address, and omits the handler for the owner', () => {
    const mapped = mapOne(hydratedEntry({}, owner, 'Jane Mitchell'));
    expect(mapped).toMatchObject({
      registeredName: 'Sunny Meadow Buddy Holly',
      dateOfBirth: '2020-03-05',
      ownerName: 'Jane Mitchell',
      ownerAddress: '12 Oak Lane, Austin, TX 78701',
      registrationNumber: 'SS12345601',
    });
    expect(mapped.handlerDiffersFromOwner).toBeUndefined();
  });

  it('flags a handler who is not the owner', () => {
    const mapped = mapOne(hydratedEntry({}, owner, 'Carlos Rivera'));
    expect(mapped.handlerDiffersFromOwner).toBe(true);
    expect(mapped.handler).toBe('Carlos Rivera');
  });

  it('treats a surname-first handler written for the owner as the owner', () => {
    expect(mapOne(hydratedEntry({}, owner, 'Mitchell, Jane')).handlerDiffersFromOwner).toBe(
      undefined
    );
  });

  it('carries the withdrawal reason code and the judge-recorded reason from the replicated row', () => {
    const withdrawn = mapOne(
      hydratedEntry({ entry_status: 'withdrawn', withdrawal_reason_code: 'in_season' }, owner, null)
    );
    expect(withdrawn).toMatchObject({
      entryStatus: 'withdrawn',
      withdrawalReasonCode: 'in_season',
    });

    const excused = mapOne(
      hydratedEntry(
        { result_status: 'excused', disqualification_reason: 'Left the search area' },
        owner,
        null
      )
    );
    expect(excused.resultReason).toBe('Left the search area');
  });

  it('prints nothing for fields the hydration did not supply', () => {
    const mapped = mapOne(hydratedEntry({}, null, null));
    expect(mapped.ownerName).toBeUndefined();
    expect(mapped.ownerAddress).toBeUndefined();
  });

  it("carries each class's maximum time onto the show report's class list", () => {
    const report = reportRegistry.find(item => item.id === 'result-catalog')!;
    const props = buildShowReportProps({
      report,
      show,
      trials: [trial],
      classes: [cls],
      entries: [],
      trialId: 'all',
      classId: 'all',
      dogId: 'all',
      sortOrder: 'placement',
    });
    expect(props.allClasses?.[0]?.timeLimitSeconds).toBe(180);
  });
});
