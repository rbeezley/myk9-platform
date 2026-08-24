import { describe, expect, it } from 'vitest';
import {
  buildClassReportProps,
  buildTrialReportProps,
  mapScopedReportEntries,
  readTrialRegistryId,
} from '../reportDataMapping';
import { calculateFinancialReportTotals } from '@/components/reports/financialReportTotals';
import { UNKNOWN_HANDLER } from '@/lib/reports/reportUtils';
import { REPORT_ENTRY_SOURCE } from '@/lib/reports/types';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { fromAny } from '@total-typescript/shoehorn';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Demo Scent Work Club',
  organization: 'AKC',
} as Show;

const trial = fromAny<DbTrial, unknown>({
  id: 'trial-1',
  date: '2026-04-12',
  event_number: '2026123401',
  registry_id: 'UKC',
  trial_number: 2026123401,
});

const classData = {
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  judge_name: 'Pat Judge',
} as DbClass;

const entry = {
  id: 'entry-1',
  // `entries.armband` is a TEXT column; the fixture matches the real shape so
  // the mapper is exercised on what the database actually returns (MYK9-243).
  armband: '7',
  class_id: 'class-1',
  run_order: 1,
  check_in_status: 'checked-in',
  is_scored: true,
  result_status: 'Q',
  search_time_seconds: 12.34,
  total_faults: 0,
  final_placement: 1,
  entry_status: 'accepted',
  payment_status: 'paid_by_check',
  entry_fee: 45,
  payment_method: 'check',
  discount_amount: 5,
  refund_amount: 0,
  comped: false,
  // Real rows carry the handler on the entry itself. This fixture used to rely
  // only on the `dog.owner` embed, which the replication path never populates —
  // the gap that let MYK9-119 ship a blank HANDLER column.
  handler: 'Jamie Walker',
  dog: {
    call_name: 'Rocket',
    breed: 'Beagle',
    owner: { first_name: 'Jamie', last_name: 'Walker' },
  },
  entry_source: REPORT_ENTRY_SOURCE.UKC_ONLINE,
} as unknown as DbEntry;

describe('buildTrialReportProps', () => {
  it('builds the same trial-scoped report props used by preview and official PDFs', () => {
    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [classData],
      entries: [entry],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props).toMatchObject({
      showId: 'show-1',
      showName: 'Spring Trial',
      clubName: 'Demo Scent Work Club',
      organization: 'AKC',
      trial: {
        date: '2026-04-12',
        eventNumber: '2026123401',
        registryId: 'UKC',
        trialNumber: '2026123401',
        judgeName: 'Pat Judge',
      },
      entries: [
        {
          id: 'entry-1',
          armband: '7',
          callName: 'Rocket',
          handler: 'Jamie Walker',
          entrySource: REPORT_ENTRY_SOURCE.UKC_ONLINE,
          entryStatus: 'accepted',
          paymentStatus: 'paid_by_check',
          entryFee: 45,
          paymentMethod: 'check',
          discountAmount: 5,
          refundAmount: 0,
          comped: false,
          classElement: 'Container',
          classLevel: 'Novice',
          classSection: 'A',
        },
      ],
    });
  });

  it('uses the registration number belonging to the trial registry', () => {
    const entryWithRegistrations = {
      ...entry,
      dog: {
        ...(entry as unknown as { dog: Record<string, unknown> }).dog,
        registrations: [
          {
            id: 'akc-registration',
            organization: 'AKC (American Kennel Club)',
            registration_number: 'AKC-123',
            is_primary: true,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'ukc-registration',
            organization: 'UKC (United Kennel Club)',
            registration_number: 'UKC-456',
            is_primary: false,
            created_at: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    } as unknown as DbEntry;

    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [classData],
      entries: [entryWithRegistrations],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props.entries[0]?.registrationNumber).toBe('UKC-456');
    expect(props.entries[0]?.registrationNumber).not.toBe('AKC-123');
  });

  it('uses assignment-shaped class judge data before legacy judge_name', () => {
    const assignmentBackedClass = {
      ...classData,
      judge_name: 'Legacy Judge',
      judge_assignments: [
        {
          person_id: 'judge-1',
          people: { first_name: 'Assigned', last_name: 'Judge' },
        },
      ],
    } as unknown as DbClass;

    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [assignmentBackedClass],
      entries: [entry],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props.trial?.judgeName).toBe('Assigned Judge');
    expect(props.entries[0]?.judgeName).toBe('Assigned Judge');
    expect(props.allClasses?.[0]?.judgeName).toBe('Assigned Judge');
  });

  it('keeps legacy judge_name fixtures displayable', () => {
    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [classData],
      entries: [entry],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props.trial?.judgeName).toBe('Pat Judge');
    expect(props.entries[0]?.judgeName).toBe('Pat Judge');
  });

  it('renders TBD only when the class is genuinely unassigned', () => {
    const unassignedClass = {
      ...classData,
      judge_name: null,
      judge_assignments: [],
    } as unknown as DbClass;

    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [unassignedClass],
      entries: [entry],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props.trial?.judgeName).toBe('TBD');
    expect(props.entries[0]?.judgeName).toBe('TBD');
  });

  it('does not silently use the first class judge for mixed-judge trial headers', () => {
    const secondClass = {
      ...classData,
      id: 'class-2',
      judge_name: 'Second Judge',
    } as DbClass;

    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [classData, secondClass],
      entries: [entry],
      scope: { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      sortOrder: '',
    });

    expect(props.trial?.judgeName).toBe('Multiple judges');
    expect(props.allClasses?.map(c => c.judgeName)).toEqual(['Pat Judge', 'Second Judge']);
  });
});

describe('buildClassReportProps', () => {
  it('builds class-scoped props for official class PDFs', () => {
    const props = buildClassReportProps({
      show,
      trials: [trial],
      classes: [
        {
          ...classData,
          time_limit_seconds: 120,
          time_limit_area2_seconds: 90,
          time_limit_area3_seconds: null,
          num_areas: 2,
        } as DbClass,
      ],
      entries: [entry],
      scope: {
        kind: 'class',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-1',
      },
      sortOrder: 'armband',
    });

    expect(props).toMatchObject({
      trial: {
        date: '2026-04-12',
        eventNumber: '2026123401',
        judgeName: 'Pat Judge',
      },
      classData: {
        element: 'Container',
        level: 'Novice',
        section: 'A',
        timeLimitSeconds: 120,
        timeLimitArea2Seconds: 90,
        areaCount: 2,
      },
      entries: [{ id: 'entry-1', armband: '7', callName: 'Rocket' }],
      sortOrder: 'armband',
    });
  });

  it('returns null when the scoped Class or Trial is not available', () => {
    expect(
      buildClassReportProps({
        show,
        trials: [trial],
        classes: [classData],
        entries: [entry],
        scope: {
          kind: 'class',
          showId: 'show-1',
          trialId: 'trial-1',
          classId: 'missing-class',
        },
        sortOrder: '',
      })
    ).toBeNull();
    expect(
      buildClassReportProps({
        show,
        trials: [],
        classes: [classData],
        entries: [entry],
        scope: {
          kind: 'class',
          showId: 'show-1',
          trialId: 'trial-1',
          classId: 'class-1',
        },
        sortOrder: '',
      })
    ).toBeNull();
  });
});

describe('mapScopedReportEntries', () => {
  const trial1 = fromAny<DbTrial, unknown>({ id: 'trial-1', date: '2026-04-12', trial_number: 1 });
  const trial2 = fromAny<DbTrial, unknown>({ id: 'trial-2', date: '2026-04-13', trial_number: 2 });
  const class1 = {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
  } as DbClass;
  const class2 = {
    id: 'class-2',
    trial_id: 'trial-2',
    element: 'Interior',
    level: 'Advanced',
    section: '',
  } as DbClass;
  const mkEntry = (id: string, armband: string, classId: string) =>
    ({
      id,
      armband,
      class_id: classId,
      is_scored: true,
      result_status: 'Q',
      final_placement: 1,
      dog: {
        call_name: `Dog ${armband}`,
        breed: 'Breed',
        owner: { first_name: 'A', last_name: 'B' },
      },
    }) as unknown as DbEntry;

  const e1 = mkEntry('e1', '7', 'class-1'); // trial 1
  const e2 = mkEntry('e2', '8', 'class-2'); // trial 2
  const trials = [trial1, trial2];
  const classes = [class1, class2];

  it('Trial 1 / All Classes excludes other trials and labels each entry with its own trial/class', () => {
    // useReportData returns ALL show entries when classId === 'all'.
    const result = mapScopedReportEntries([e1, e2], trials, classes, {
      kind: 'trial',
      showId: 'show-1',
      trialId: 'trial-1',
    });
    expect(result.map(r => r.id)).toEqual(['e1']);
    expect(result[0]).toMatchObject({
      trialNumber: '1',
      classElement: 'Container',
      classLevel: 'Novice',
      classSection: 'A',
    });
  });

  it('All Trials / All Classes keeps everything and enriches each per-entry', () => {
    const result = mapScopedReportEntries([e1, e2], trials, classes, {
      kind: 'show',
      showId: 'show-1',
    });
    expect(result.map(r => r.id)).toEqual(['e1', 'e2']);
    expect(result.find(r => r.id === 'e2')).toMatchObject({
      trialNumber: '2',
      classElement: 'Interior',
      classLevel: 'Advanced',
    });
  });

  it('single-class scope enriches the already-scoped entries with the selected class', () => {
    // useReportData has already filtered entries to class-1 here.
    const result = mapScopedReportEntries([e1], trials, classes, {
      kind: 'class',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    });
    expect(result.map(r => r.id)).toEqual(['e1']);
    expect(result[0]).toMatchObject({ classElement: 'Container', trialNumber: '1' });
  });

  it('single-class scope rejects entries from another Class even when a caller passes Show data', () => {
    const result = mapScopedReportEntries([e1, e2], trials, classes, {
      kind: 'class',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    });

    expect(result.map(reportEntry => reportEntry.id)).toEqual(['e1']);
  });

  it('preserves replicated financial fields through report totals', () => {
    const replicated = rowToEntry({
      id: 'entry-financial',
      class_id: 'class-1',
      show_id: 'show-1',
      dog_id: 'dog-1',
      entry_status: 'accepted',
      armband: '101',
      entry_fee: 60,
      payment_status: 'partial_refund',
      payment_method: 'credit_card',
      discount_amount: 10,
      refund_amount: 20,
      comped: false,
      updated_at: '2026-06-01T12:00:00.000Z',
    } as Parameters<typeof rowToEntry>[0]);
    const dbRow = mapReplicatedEntryToDbRow(replicated, {
      dog: { id: 'dog-1', name: 'Rocket', callName: 'Rocket', breed: 'Beagle' },
    }) as DbEntry;

    const reportEntries = mapScopedReportEntries([dbRow], trials, classes, {
      kind: 'show',
      showId: 'show-1',
    });
    const totals = calculateFinancialReportTotals(reportEntries, 'current');

    expect(reportEntries[0]).toMatchObject({
      discountAmount: 10,
      refundAmount: 20,
      comped: false,
    });
    expect(totals.summary).toMatchObject({
      gross: 60,
      discount: 10,
      collected: 50,
      refunded: 20,
      netRetained: 30,
    });
  });

  describe('handler resolution (MYK9-119)', () => {
    // The fixtures above hand-supply `dog.owner`, which the replication path
    // never produces — that is why the blank HANDLER column survived. These
    // drive the real chain instead: Supabase row -> rowToEntry ->
    // mapReplicatedEntryToDbRow, exactly what the Reports page receives.
    const handlerDbRow = (overrides: Record<string, unknown> = {}) =>
      mapReplicatedEntryToDbRow(
        rowToEntry({
          id: 'entry-handler',
          class_id: 'class-1',
          show_id: 'show-1',
          dog_id: 'dog-1',
          armband: '100',
          entry_status: 'confirmed',
          handler_id: 'person-1',
          handler: 'Test Secretary',
          ...overrides,
        } as Parameters<typeof rowToEntry>[0]),
        { dog: { id: 'dog-1', name: 'Willow', callName: 'Willow', breed: 'Labrador Retriever' } }
      ) as DbEntry;

    const handlerOf = (row: DbEntry) =>
      mapScopedReportEntries([row], trials, classes, { kind: 'show', showId: 'show-1' })[0]
        ?.handler;

    it('prints the handler name carried on the entry', () => {
      expect(handlerOf(handlerDbRow())).toBe('Test Secretary');
    });

    it('renders a clear placeholder rather than an ambiguous blank', () => {
      // A blank cell on a gate sheet reads as "no handler needed"; the steward
      // cannot tell it apart from missing data.
      const handler = handlerOf(handlerDbRow({ handler: null, handler_id: null }));

      expect(handler).not.toBe('');
      expect(handler).toBe(UNKNOWN_HANDLER);
    });

    it('does not fall back to the dog owner, who need not be the handler', () => {
      const row = {
        ...handlerDbRow({ handler: null, handler_id: null }),
        dog: {
          call_name: 'Willow',
          breed: 'Labrador Retriever',
          owner: { first_name: 'Dog', last_name: 'Owner' },
        },
      } as unknown as DbEntry;

      expect(handlerOf(row)).toBe(UNKNOWN_HANDLER);
    });

    it('ignores a whitespace-only handler', () => {
      expect(handlerOf(handlerDbRow({ handler: '   ' }))).toBe(UNKNOWN_HANDLER);
    });
  });

  it('maps joined enrollment payment fields for secretary-recorded closeout totals', () => {
    const paidEnrollmentEntry = {
      ...e1,
      payment_status: 'pending',
      payment_method: 'check',
      entry_fee: 45,
      registration: {
        payment_status: 'paid_by_check',
      },
    } as unknown as DbEntry;

    const reportEntries = mapScopedReportEntries([paidEnrollmentEntry], trials, classes, {
      kind: 'show',
      showId: 'show-1',
    });
    const totals = calculateFinancialReportTotals(reportEntries, 'current');

    expect(reportEntries[0]).toMatchObject({
      paymentStatus: 'pending',
      enrollmentPaymentStatus: 'paid_by_check',
    });
    expect(totals.summary).toMatchObject({
      collected: 45,
      outstanding: 0,
      netRetained: 45,
    });
  });
});

describe('readTrialRegistryId', () => {
  it('defaults to AKC when registry_id is missing or blank', () => {
    expect(readTrialRegistryId({ ...trial, registry_id: undefined } as unknown as DbTrial)).toBe(
      'AKC'
    );
    expect(readTrialRegistryId({ ...trial, registry_id: null } as unknown as DbTrial)).toBe('AKC');
    expect(readTrialRegistryId({ ...trial, registry_id: '   ' } as DbTrial)).toBe('AKC');
  });
});
