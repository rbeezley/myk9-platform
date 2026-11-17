/**
 * MYK9-2103: the class card's printed-sheet rows and Reports' rows must give the SAME packet
 * input, so a fingerprint built from either hashes the same printed text.
 *
 * Card side: the real `usePrintedSheetEntries`. Reports side: the real `hydrateReportEntries`
 * (the function `useReportData` runs) then `buildEmergencyPacketData`. Only the replica and network
 * reads underneath are mocked; the mocked entry readers apply the real armband backfill the real
 * readers use (their own calls to it are tested in entryQueries.replication.test.ts).
 */
import { act, screen, waitFor } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { replicatedEntriesTable } from '@/services/replication';

import { render } from '@/test/utils/testUtils';
import {
  buildEmergencyPacketData,
  buildPacketClasses,
  buildPacketEntries,
  buildPacketTrials,
} from '@/pages/secretary/ReportsPage/buildPacketData';
import { getEntriesByClass, getEntriesByShowFromReplication } from '@/services/database/entries';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { buildClassPaperworkMap } from '@/features/show-map/cockpit/buildClassPaperworkMap';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import { buildSheetDescriptorFromPrinted } from '../../../../../supabase/functions/_shared/paperwork/printedSheet.ts';
import type { ReplicatedPaperworkPrint } from '@/services/replication';
import { hydrateReportEntries } from './reportEntryHydration';
import { usePrintedSheetEntries, type PrintedSheetData } from './usePrintedSheetEntries';

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  trials: [] as unknown[],
  classes: [] as unknown[],
  registrations: new Map<string, Record<string, unknown>[]>(),
  armbands: [] as { showId: string; dogId: string; armbandNumber: string }[],
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    getByShow: async () => mocks.armbands,
    subscribe: () => () => undefined,
  },
}));
vi.mock('@/services/database/entries', async () => {
  const { backfillMissingArmbands: backfill } =
    await import('@/services/database/entries/armbandBackfill');
  return {
    getEntriesByShowFromReplication: async () => ({
      data: await backfill(mocks.rows),
      error: null,
    }),
    getEntriesByClass: async (classId: string) => ({
      data: await backfill(mocks.rows.filter(row => row.class_id === classId)),
      error: null,
    }),
  };
});
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: async () => ({ data: mocks.trials, error: null }),
}));
vi.mock('@/services/database/classes', () => ({
  getClassesByTrialId: async (trialId: string) => ({
    data: (mocks.classes as DbClass[]).filter(cls => cls.trial_id === trialId),
    error: null,
  }),
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: async () => ({
    byDog: mocks.registrations,
    registrationsReadComplete: true,
    serverError: null,
    source: 'server',
  }),
}));
vi.mock('@/services/database/users/juniorHandlerProfiles', () => ({
  loadEntryHandlerJuniorFlags: async () => ({ byEntryId: new Map(), readComplete: true }),
}));
vi.mock('@/services/database/dogs/catalogProfiles', () => ({
  loadCatalogDogProfiles: async () => ({ byDogId: new Map(), readComplete: true }),
}));

const trials = [
  { id: 'trial-akc', date: '2026-12-05', trial_number: '1', registry_id: 'AKC' },
  { id: 'trial-ukc', date: '2026-12-06', trial_number: '2', registry_id: 'UKC' },
].map(trial => fromAny<DbTrial, unknown>(trial));
const classes = [
  {
    id: 'class-akc',
    trial_id: 'trial-akc',
    element: 'Container',
    level: 'Novice',
    class_number: 1,
    judge_assignments: [
      { person_id: 'p1', status: 'confirmed', people: { first_name: 'Pat', last_name: 'Donovan' } },
    ],
  },
  { id: 'class-ukc', trial_id: 'trial-ukc', element: 'Interior', level: 'Novice', class_number: 2 },
].map(cls => fromAny<DbClass, unknown>(cls));
const show = {
  id: 'show-1',
  name: 'Winter Trial',
  organization: 'AKC',
  assignedJudges: [{ judgeId: 'j1', judgeName: 'Ada Assigned', assignedClasses: ['class-ukc'] }],
} as unknown as Show;

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'e',
    class_id: 'class-akc',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: '101',
    run_order: 1,
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    handler: 'Pat Handler',
    dog: { id: 'dog-1', call_name: 'Buddy', breed: 'Beagle' },
    ...overrides,
  };
}

const fixtures = [
  row({ id: 'suffixed', armband: '12A' }),
  row({
    id: 'null-armband',
    armband: null,
    dog_id: 'dog-2',
    dog: { id: 'dog-2', call_name: 'Nil' },
  }),
  row({ id: 'zero-armband', armband: 0, dog_id: 'dog-3', dog: { id: 'dog-3', call_name: 'Zed' } }),
  row({
    id: 'blank-handler',
    handler: '',
    dog_id: 'dog-4',
    dog: { id: 'dog-4', call_name: 'Owned', owner: { first_name: 'Olive', last_name: 'Owner' } },
  }),
  row({ id: 'no-dog-row', dog_id: 'dog-5', dog: null }),
  row({
    id: 'blank-armband',
    armband: '',
    dog_id: 'dog-7',
    dog: { id: 'dog-7', call_name: 'Late' },
  }),
  row({ id: 'ukc', class_id: 'class-ukc' }),
  row({ id: 'no-registration', class_id: 'class-ukc', dog_id: 'dog-6', dog: { id: 'dog-6' } }),
];

function Probe({ onData }: { onData: (data: PrintedSheetData) => void }) {
  const { data } = usePrintedSheetEntries('show-1');
  if (data) onData(data);
  return <div>{data ? 'loaded' : 'loading'}</div>;
}

async function readCard(): Promise<PrintedSheetData> {
  let card: PrintedSheetData | undefined;
  render(<Probe onData={found => (card = found)} />);
  await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
  // The hydration lands after the rows; wait for the registration number it supplies.
  await waitFor(() => {
    const suffixed = card?.entries.find(entry => entry.id === 'suffixed');
    expect(suffixed?.dog?.registrations?.length).toBeGreaterThan(0);
  });
  return card!;
}

describe('printed-sheet rows: class card and Reports build the same packet input', () => {
  beforeEach(() => {
    mocks.rows = fixtures;
    mocks.trials = trials;
    mocks.classes = classes;
    mocks.armbands = [{ showId: 'show-1', dogId: 'dog-7', armbandNumber: '301' }];
    mocks.registrations = new Map([
      [
        'dog-1',
        [
          { organization: 'AKC (American Kennel Club)', registration_number: 'AKC-1' },
          { organization: 'UKC', registration_number: 'UKC-1' },
        ],
      ],
      ['dog-2', [{ organization: 'AKC (American Kennel Club)', registration_number: 'AKC-2' }]],
      ['dog-4', [{ organization: 'AKC (American Kennel Club)', registration_number: 'AKC-4' }]],
    ]);
  });

  it('show-scope Reports and the card give equal trials, classes and entries', async () => {
    const card = await readCard();

    const showRows = (await getEntriesByShowFromReplication('show-1')).data as ReportDbEntry[];
    const reportsRows = (await hydrateReportEntries(showRows)).entries;
    const reports = buildEmergencyPacketData({ show, trials, classes, entries: reportsRows });

    const assignedJudges = show.assignedJudges ?? [];
    expect(buildPacketTrials(card.trials)).toEqual(reports.trials);
    expect(buildPacketClasses(card.classes, assignedJudges)).toEqual(reports.classes);
    const cardEntries = buildPacketEntries(card.entries, card.trials, card.classes, assignedJudges);
    expect(cardEntries).toEqual(reports.entries);

    const byId = new Map(cardEntries.map(entry => [entry.id, entry] as const));
    expect(cardEntries).toHaveLength(fixtures.length);
    // Armbands: a suffix survives; null and 0 both print as no armband; a blank one is backfilled.
    expect(byId.get('suffixed')?.armband).toBe('12A');
    expect(byId.get('null-armband')?.armband).toBeNull();
    expect(byId.get('blank-armband')?.armband).toBe('301');
    expect(byId.get('zero-armband')?.armband).toBeNull();
    // Registration numbers follow the trial's registry.
    expect(byId.get('suffixed')?.registrationNumber).toBe('AKC-1');
    expect(byId.get('ukc')?.registrationNumber).toBe('UKC-1');
    expect(byId.get('no-registration')?.registrationNumber ?? null).toBeNull();
    // Handler and dog fallbacks.
    expect(byId.get('blank-handler')?.handler).toBe(
      reports.entries.find(e => e.id === 'blank-handler')?.handler
    );
    expect(byId.get('blank-handler')?.handler).not.toBe('');
    expect(byId.get('no-dog-row')?.callName).toBe(
      reports.entries.find(e => e.id === 'no-dog-row')?.callName
    );
    // Judges: a confirmed assignment on the class, and the show's assigned judge as the fallback.
    const judgeOf = (id: string) => reports.classes.find(c => c.id === id)?.judgeName;
    expect(judgeOf('class-akc')).toBe('Pat Donovan');
    expect(judgeOf('class-ukc')).toBe('Ada Assigned');
  });

  it('class-scope Reports (the class reader) equals the card rows filtered to that class', async () => {
    const card = await readCard();

    for (const classId of ['class-akc', 'class-ukc']) {
      const classRows = (await getEntriesByClass(classId)).data as ReportDbEntry[];
      const reportsRows = (await hydrateReportEntries(classRows)).entries;
      const reports = buildEmergencyPacketData({ show, trials, classes, entries: reportsRows });
      const cardForClass = buildPacketEntries(
        card.entries.filter(entry => entry.class_id === classId),
        card.trials,
        card.classes,
        show.assignedJudges ?? []
      );
      expect(cardForClass).toEqual(reports.entries);
      expect(cardForClass.length).toBeGreaterThan(0);
    }
  });
});

describe('printed-sheet rows: an entry that arrives after the first hydration', () => {
  it('a new entry for an already-hydrated dog carries its registration number, as in Reports', async () => {
    mocks.rows = fixtures;
    mocks.trials = trials;
    mocks.classes = classes;
    mocks.armbands = [];
    mocks.registrations = new Map([
      [
        'dog-1',
        [
          { organization: 'AKC (American Kennel Club)', registration_number: 'AKC-1' },
          { organization: 'UKC', registration_number: 'UKC-1' },
        ],
      ],
    ]);
    const listeners: Array<() => void> = [];
    vi.spyOn(replicatedEntriesTable, 'subscribe').mockImplementation(listener => {
      listeners.push(listener as () => void);
      return () => undefined;
    });

    let card: PrintedSheetData | undefined;
    render(<Probe onData={found => (card = found)} />);
    await waitFor(() => expect(card?.entries.length).toBe(fixtures.length));

    // A move-up: dog-1 (already hydrated) is entered in a second class.
    mocks.rows = [...fixtures, row({ id: 'move-up', class_id: 'class-ukc' })];
    listeners.forEach(listener => listener());
    await waitFor(() => expect(card?.entries.some(entry => entry.id === 'move-up')).toBe(true), {
      timeout: 3000,
    });

    const showRows = (await getEntriesByShowFromReplication('show-1')).data as ReportDbEntry[];
    const reportsRows = (await hydrateReportEntries(showRows)).entries;
    const reports = buildEmergencyPacketData({ show, trials, classes, entries: reportsRows });
    const cardEntries = buildPacketEntries(
      card!.entries,
      card!.trials,
      card!.classes,
      show.assignedJudges ?? []
    );
    expect(cardEntries).toEqual(reports.entries);
    expect(cardEntries.find(entry => entry.id === 'move-up')?.registrationNumber).toBe('UKC-1');
  });
});

describe('printed-sheet fingerprints: the card, Reports and the shared function agree', () => {
  const SHEETS = ['check-in-sheet', 'scoresheet'] as const;
  const scopeOf = (classId: string) => {
    const trialId = classId === 'class-akc' ? 'trial-akc' : 'trial-ukc';
    return { kind: 'class' as const, showId: 'show-1', trialId, classId };
  };

  beforeEach(() => {
    mocks.rows = fixtures;
    mocks.trials = trials;
    mocks.classes = classes;
    mocks.armbands = [{ showId: 'show-1', dogId: 'dog-7', armbandNumber: '301' }];
    mocks.registrations = new Map([
      ['dog-1', [{ organization: 'AKC (American Kennel Club)', registration_number: 'AKC-1' }]],
    ]);
  });

  async function reportsRows() {
    const showRows = (await getEntriesByShowFromReplication('show-1')).data as ReportDbEntry[];
    return (await hydrateReportEntries(showRows)).entries;
  }

  function cardFingerprint(
    card: Pick<PrintedSheetData, 'trials' | 'classes' | 'entries'>,
    classId: string,
    reportId: string,
    assignedJudges: Show['assignedJudges'] | undefined
  ) {
    const map = buildClassPaperworkMap({
      showId: 'show-1',
      classes: card.classes,
      trials: card.trials.map(trial => ({ id: trial.id, trialDate: trial.date ?? '' })),
      entries: [],
      printedSheets: card,
      printedSheetsSettled: true,
      records: [],
      returnTo: '/x',
      assignedJudges,
    });
    return map.get(classId)?.find(item => item.reportId === reportId)?.confirmation?.fingerprint;
  }

  it.each(SHEETS)(
    '%s: Reports path, card path and the direct function give equal fingerprints',
    async reportId => {
      const card = await readCard();
      const rows = await reportsRows();
      const direct = buildEmergencyPacketData({ show, trials, classes, entries: rows });
      for (const classId of ['class-akc', 'class-ukc']) {
        const scope = scopeOf(classId);
        const reports = buildReportPaperworkDescriptor({
          reportId,
          scope,
          classes,
          entries: [],
          assignedJudges: show.assignedJudges,
          printedSheets: { trials, classes, entries: rows },
        });
        const shared = buildSheetDescriptorFromPrinted({
          reportId,
          scope,
          trials: direct.trials,
          classes: direct.classes,
          entries: direct.entries,
        });
        expect(reports).not.toBeNull();
        expect(reports?.fingerprint).toBe(shared?.fingerprint);
        expect(cardFingerprint(card, classId, reportId, show.assignedJudges)).toBe(
          reports?.fingerprint
        );
      }
    }
  );

  it.each(SHEETS)(
    '%s: a print recorded from Reports reads current on the card once the late inputs settle',
    async reportId => {
      const card = await readCard();
      const rows = await reportsRows();
      const classId = 'class-ukc';
      const printed = buildReportPaperworkDescriptor({
        reportId,
        scope: scopeOf(classId),
        classes,
        entries: [],
        assignedJudges: show.assignedJudges,
        printedSheets: { trials, classes, entries: rows },
      })!;
      const records = [
        {
          id: 'r1',
          showId: 'show-1',
          trialId: 'trial-ukc',
          classId,
          scopeKind: 'class',
          reportId,
          coverage: printed.coverage,
          fingerprint: printed.fingerprint,
          printedBy: 'u1',
          printedByName: 'Jannie',
          printedAt: '2026-12-06T08:00:00Z',
        },
      ] as unknown as ReplicatedPaperworkPrint[];
      const stateOn = (
        entriesRead: ReportDbEntry[],
        assignedJudges: Show['assignedJudges'] | undefined
      ) =>
        buildClassPaperworkMap({
          showId: 'show-1',
          classes: card.classes,
          trials: card.trials.map(trial => ({ id: trial.id, trialDate: trial.date ?? '' })),
          entries: [],
          printedSheets: { trials: card.trials, classes: card.classes, entries: entriesRead },
          printedSheetsSettled: true,
          records,
          returnTo: '/x',
          assignedJudges,
        })
          .get(classId)
          ?.find(item => item.reportId === reportId)?.state;

      // Cold: no show details (the assigned judge) and no registrations hydrated yet. A verdict of
      // changed is what the paper would show, and it is not permanent.
      const bare = card.entries.map(entry => ({
        ...entry,
        dog: entry.dog ? { ...entry.dog, registrations: [] } : entry.dog,
      }));
      expect(stateOn(bare, undefined)).toBe('stale');
      // Settled: the judge and the registrations have landed.
      expect(stateOn(card.entries, show.assignedJudges)).toBe('current');
    }
  );
});

describe('printed-sheet rows: a replica notice marks the rows as about to change', () => {
  it('reports noticePending from the notice until its re-read is delivered', async () => {
    mocks.rows = fixtures;
    mocks.trials = trials;
    mocks.classes = classes;
    mocks.armbands = [];
    mocks.registrations = new Map();
    const listeners: Array<() => void> = [];
    vi.spyOn(replicatedEntriesTable, 'subscribe').mockImplementation(listener => {
      listeners.push(listener as () => void);
      return () => undefined;
    });
    function PendingProbe() {
      const { data, noticePending } = usePrintedSheetEntries('show-1');
      return <div>{`${data ? 'loaded' : 'loading'} ${noticePending ? 'pending' : 'quiet'}`}</div>;
    }
    render(<PendingProbe />);
    await waitFor(() => expect(screen.getByText('loaded quiet')).toBeInTheDocument());

    act(() => listeners.forEach(listener => listener()));
    expect(screen.getByText('loaded pending')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('loaded quiet')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });
});
