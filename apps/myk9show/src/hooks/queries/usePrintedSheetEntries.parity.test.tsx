/**
 * MYK9-2103: the class card's printed-sheet rows and Reports' rows must give the SAME packet
 * input, so a fingerprint built from either hashes the same printed text. The card side reads
 * through `usePrintedSheetEntries`; the Reports side is the replica read plus the registration
 * join `useReportData` runs (`attachDogRegistrations`), fed to `buildEmergencyPacketData`.
 */
import { screen, waitFor } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import {
  buildEmergencyPacketData,
  buildPacketClasses,
  buildPacketEntries,
} from '@/pages/secretary/ReportsPage/buildPacketData';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { attachDogRegistrations } from './attachDogRegistrations';
import { usePrintedSheetEntries } from './usePrintedSheetEntries';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  registrations: new Map<string, Record<string, unknown>[]>(),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByShowFromReplication: async () => ({ data: mocks.rows, error: null }),
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: async () => ({
    byDog: mocks.registrations,
    registrationsReadComplete: true,
    serverError: null,
    source: 'server',
  }),
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
  },
  { id: 'class-ukc', trial_id: 'trial-ukc', element: 'Interior', level: 'Novice', class_number: 2 },
].map(cls => fromAny<DbClass, unknown>(cls));
const show = { id: 'show-1', name: 'Winter Trial', organization: 'AKC' } as Show;

function row(overrides: Record<string, unknown>): ReportDbEntry {
  return fromAny<ReportDbEntry, unknown>({
    id: 'e',
    class_id: 'class-akc',
    dog_id: 'dog-1',
    armband: '101',
    run_order: 1,
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    handler: 'Pat Handler',
    dog: { id: 'dog-1', call_name: 'Buddy', breed: 'Beagle' },
    ...overrides,
  });
}

const fixtures: ReportDbEntry[] = [
  row({ id: 'suffixed', armband: '12A', dog_id: 'dog-1' }),
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
    dog: {
      id: 'dog-4',
      call_name: 'Owned',
      owner: { first_name: 'Olive', last_name: 'Owner' },
    },
  }),
  row({ id: 'no-dog-row', dog_id: 'dog-5', dog: null }),
  row({ id: 'ukc', class_id: 'class-ukc', dog_id: 'dog-1' }),
  row({ id: 'no-registration', class_id: 'class-ukc', dog_id: 'dog-6' }),
];

function Probe({ onRows }: { onRows: (rows: ReportDbEntry[]) => void }) {
  const query = usePrintedSheetEntries('show-1');
  if (query.data) onRows(query.data.entries);
  return <div>{query.data ? 'loaded' : 'loading'}</div>;
}

describe('printed-sheet rows: class card and Reports build the same packet input', () => {
  beforeEach(() => {
    mocks.rows = fixtures;
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

  it('gives equal classes and entries for suffixed, null, zero, blank-handler, missing-dog, UKC and unregistered rows', async () => {
    let cardRows: ReportDbEntry[] = [];
    render(<Probe onRows={found => (cardRows = found)} />);
    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());

    const reportsRows = (await attachDogRegistrations(fixtures)).entries;
    const reports = buildEmergencyPacketData({ show, trials, classes, entries: reportsRows });

    expect(buildPacketClasses(classes)).toEqual(reports.classes);
    const cardEntries = buildPacketEntries(cardRows, trials, classes);
    expect(cardEntries).toEqual(reports.entries);

    // Guard against a vacuous pass: the fixtures really exercise the cases.
    const byId = new Map(cardEntries.map(entry => [entry.id, entry] as const));
    expect(byId.get('suffixed')?.armband).toBeDefined();
    expect(byId.get('ukc')?.registrationNumber).toBe('UKC-1');
    expect(byId.get('suffixed')?.registrationNumber).toBe('AKC-1');
    expect(byId.get('no-registration')?.registrationNumber ?? null).toBeNull();
    expect(cardEntries.length).toBe(fixtures.length);
  });
});
