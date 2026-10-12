import { describe, expect, it } from 'vitest';

import type { ReportScope } from '@/lib/reports/types';
import {
  toSecretaryEntry,
  type SecretaryEntryRelations,
} from '@/services/database/entries/secretaryReadReplication';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { DbClass, DbEntry } from '@/types/database-mappings';

import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';

// MYK9-1031: Reports fingerprints a print from `mapReplicatedEntryToDbRow` rows, while Results and
// Overview re-derive it from `toSecretaryEntry` rows. The same replicated entry must give the same
// fingerprint through both, or a print reads "Stale" the moment the secretary leaves Reports.
const CLASS = {
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  status: 'completed',
  judge_name: 'Pat Donovan',
  time_limit_seconds: 180,
  num_areas: 1,
  num_hides: 1,
} as unknown as DbClass;
const SCOPE: ReportScope = {
  kind: 'class',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
} as ReportScope;
const RELATIONS: SecretaryEntryRelations = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
};

function fingerprintsThroughBothReadPaths(patch: Record<string, unknown>) {
  const entry = {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    showId: 'show-1',
    armband: '200',
    isScored: true,
    ...patch,
  } as unknown as ReplicatedEntry;
  const descriptorFor = (row: unknown) =>
    buildReportPaperworkDescriptor({
      reportId: 'results-sheet',
      scope: SCOPE,
      classes: [CLASS],
      entries: [row as DbEntry],
    })?.fingerprint;
  return {
    reports: descriptorFor(mapReplicatedEntryToDbRow(entry, { dog: null })),
    results: descriptorFor(toSecretaryEntry(entry, RELATIONS)),
  };
}

describe('buildReportPaperworkDescriptor: one fingerprint whichever read path built the rows', () => {
  it.each([
    [
      'numeric results',
      { resultStatus: 'qualified', finalPlacement: 1, searchTimeSeconds: 42.31, totalFaults: 0 },
    ],
    [
      'NUMERIC columns held as strings',
      {
        resultStatus: 'qualified',
        finalPlacement: '1',
        searchTimeSeconds: '42.31',
        totalFaults: '0',
      },
    ],
    [
      'a trailing zero',
      { resultStatus: 'qualified', finalPlacement: 1, searchTimeSeconds: '45.50', totalFaults: 0 },
    ],
    [
      'no results yet',
      { resultStatus: null, finalPlacement: null, searchTimeSeconds: null, totalFaults: null },
    ],
  ])('%s', (_name, patch) => {
    const { reports, results } = fingerprintsThroughBothReadPaths(patch);
    expect(reports).toBeDefined();
    expect(results).toBe(reports);
  });
});
