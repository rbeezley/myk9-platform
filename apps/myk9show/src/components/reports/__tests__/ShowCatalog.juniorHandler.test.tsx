/**
 * MYK9-570. The catalog marks a junior handler. Rendered on the REAL prop shape
 * through the real component, because the derivation happens one hop earlier and
 * a unit test of the pure policy cannot see a projection that drops the field
 * (LESSON last-hop-drop).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ShowCatalog } from '../ShowCatalog';
import { mapReportEntries } from '@/pages/secretary/ReportsPage/reportDataMapping';
import type { ReportEntry, ReportProps, ReportDbEntry } from '@/lib/reports/types';
import type { DbTrial } from '@/types/database-mappings';

const BASE_ENTRY: Omit<ReportEntry, 'id' | 'handler'> = {
  armband: '101',
  runOrder: 1,
  callName: 'Buddy',
  breed: 'Golden Retriever',
  registrationNumber: 'DN12345678',
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
  trialId: 't1',
  trialNumber: '1',
  trialDate: '2026-04-12',
  classElement: 'Container',
  classLevel: 'Novice',
  classId: 'c1',
};

function propsWith(entries: ReportEntry[]): ReportProps {
  return {
    showName: 'Spring Scent Trial 2026',
    organization: 'AKC',
    sortOrder: 'armband',
    entries,
    allTrials: [{ id: 't1', trialNumber: '1', date: '2026-04-12' }],
  } as ReportProps;
}

describe('ShowCatalog junior handler mark', () => {
  it('marks a junior handler and leaves an adult alone', () => {
    render(
      <ShowCatalog
        {...propsWith([
          { ...BASE_ENTRY, id: 'e1', handler: 'Mariana Rivera', handlerIsJunior: true },
          { ...BASE_ENTRY, id: 'e2', armband: '102', handler: 'Carlos Rivera' },
        ])}
      />
    );

    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Rivera Jr.')).not.toBeInTheDocument();
  });

  it('prints the plain name when junior status is unknown', () => {
    // `handlerIsJunior` absent is "we do not know" — a handler with no date of
    // birth, or a hydration read that did not complete. It must not print a mark
    // and it must not print anything else either.
    render(
      <ShowCatalog {...propsWith([{ ...BASE_ENTRY, id: 'e3', handler: 'Unknown Age Person' }])} />
    );
    expect(screen.getByText('Unknown Age Person')).toBeInTheDocument();
  });

  it('does NOT put the junior handler number on the catalog line', () => {
    // There is no column for it; the number prints on the registry entry form.
    render(
      <ShowCatalog
        {...propsWith([
          {
            ...BASE_ENTRY,
            id: 'e4',
            handler: 'Mariana Rivera',
            handlerIsJunior: true,
            handlerJuniorNumber: '7654321',
          },
        ])}
      />
    );
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
    expect(screen.queryByText(/7654321/)).not.toBeInTheDocument();
  });
});

describe('end to end from the db row the catalog is fed', () => {
  const trial: DbTrial = {
    id: 't1',
    date: '2026-04-12',
    registry_id: 'AKC',
    trial_number: '1',
  } as DbTrial;

  function dbEntry(dateOfBirth: string | null): ReportDbEntry {
    return {
      id: 'e1',
      dog_id: 'd1',
      class_id: 'c1',
      trial_id: 't1',
      armband: '101',
      handler: 'Mariana Rivera',
      handler_person: { date_of_birth: dateOfBirth, junior_handler_numbers: { AKC: '7654321' } },
      dog: { id: 'd1', call_name: 'Buddy', breed: 'Golden Retriever', registrations: [] },
    } as unknown as ReportDbEntry;
  }

  it('marks a handler who is 17 on the trial date and not one who is 18', () => {
    const [junior] = mapReportEntries([dbEntry('2008-09-18')], trial);
    const [adult] = mapReportEntries([dbEntry('2008-04-11')], trial);
    expect(junior?.handlerIsJunior).toBe(true);
    expect(junior?.handlerJuniorNumber).toBe('7654321');
    expect(adult?.handlerIsJunior).toBeUndefined();
    expect(adult?.handlerJuniorNumber).toBeUndefined();

    render(<ShowCatalog {...propsWith([junior as ReportEntry])} />);
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
  });

  it('leaves the entry unmarked when the handler person was never hydrated', () => {
    const entry = { ...dbEntry('2008-09-18') };
    delete (entry as { handler_person?: unknown }).handler_person;
    const [mapped] = mapReportEntries([entry], trial);
    expect(mapped?.handlerIsJunior).toBeUndefined();
  });
});
