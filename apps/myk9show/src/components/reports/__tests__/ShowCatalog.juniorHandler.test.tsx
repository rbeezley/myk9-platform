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
          { ...BASE_ENTRY, id: 'e4', handler: 'Mariana Rivera', handlerIsJunior: true },
        ])}
      />
    );
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
    expect(screen.queryByText(/7654321/)).not.toBeInTheDocument();
  });
});

/**
 * MYK9-664: the catalog no longer sees a date of birth. Each entry records its
 * junior flag at creation (`recorded_entry_handler_junior_flags`, computed from
 * the SQL twin of `deriveJuniorStatus`; the age/registry rules are pinned in
 * supabase/tests/myk9_664_people_private_test.sql), and the mapper only decides
 * whether the flagged person is the handler the paperwork prints.
 */
describe('end to end from the db row the catalog is fed', () => {
  const trial: DbTrial = {
    id: 't1',
    date: '2026-04-12',
    registry_id: 'AKC',
    trial_number: '1',
  } as DbTrial;

  function dbEntry(
    isJunior: boolean | null,
    person: Partial<{ first_name: string; last_name: string }> = {}
  ): ReportDbEntry {
    return {
      id: 'e1',
      dog_id: 'd1',
      class_id: 'c1',
      trial_id: 't1',
      armband: '101',
      handler: 'Mariana Rivera',
      handler_person: {
        first_name: 'Mariana',
        last_name: 'Rivera',
        ...person,
        is_junior: isJunior,
      },
      dog: { id: 'd1', call_name: 'Buddy', breed: 'Golden Retriever', registrations: [] },
    } as unknown as ReportDbEntry;
  }

  it('marks a handler the database flags junior, and not one it flags adult', () => {
    const [junior] = mapReportEntries([dbEntry(true)], trial);
    const [adult] = mapReportEntries([dbEntry(false)], trial);
    expect(junior?.handlerIsJunior).toBe(true);
    expect(adult?.handlerIsJunior).toBeUndefined();

    render(<ShowCatalog {...propsWith([junior as ReportEntry])} />);
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
  });

  it('marks an ID-only assigned junior from the canonical hydrated handler identity', () => {
    const entry = {
      ...dbEntry(true),
      handler: null,
      handler_id: 'handler-1',
      handler_identity: {
        name: 'Mariana Rivera',
        person: { id: 'handler-1', first_name: 'Mariana', last_name: 'Rivera' },
        source: 'assigned-person' as const,
      },
    } as unknown as ReportDbEntry;
    const [mapped] = mapReportEntries([entry], trial);

    expect(mapped?.handler).toBe('Mariana Rivera');
    expect(mapped?.handlerIsJunior).toBe(true);

    render(<ShowCatalog {...propsWith([mapped as ReportEntry])} />);
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
  });

  it('refuses to mark when handler_id names someone other than the printed handler', () => {
    // The P1 from round 1. `entries.handler` is free text, `entries.handler_id` is
    // a FK, and a rename leaves the id behind. Here the paperwork says "Grandma
    // Smith" while handler_id points at a 14-year-old. Marking her would claim
    // junior eligibility for an adult on official AKC paperwork.
    const entry = dbEntry(true, { first_name: 'Ada', last_name: 'Smith' });
    (entry as { handler?: string }).handler = 'Grandma Smith';

    const [mapped] = mapReportEntries([entry], trial);
    expect(mapped?.handlerIsJunior).toBeUndefined();

    render(<ShowCatalog {...propsWith([mapped as ReportEntry])} />);
    expect(screen.getByText('Grandma Smith')).toBeInTheDocument();
    expect(screen.queryByText(/Jr\./)).not.toBeInTheDocument();
  });

  it('still marks when the name matches, allowing punctuation and "Last, First"', () => {
    for (const printed of ['Mariana Rivera', 'mariana  rivera', 'Rivera, Mariana']) {
      const entry = dbEntry(true);
      (entry as { handler?: string }).handler = printed;
      expect(mapReportEntries([entry], trial)[0]?.handlerIsJunior, printed).toBe(true);
    }
  });

  it('refuses to mark when the hydrated person carries no name at all', () => {
    const entry = dbEntry(true);
    (entry as { handler_person?: Record<string, unknown> }).handler_person = { is_junior: true };
    expect(mapReportEntries([entry], trial)[0]?.handlerIsJunior).toBeUndefined();
  });

  it('does not mark when the database could not derive it (no date of birth, ASCA)', () => {
    const [mapped] = mapReportEntries([dbEntry(null)], trial);
    expect(mapped?.handlerIsJunior).toBeUndefined();

    render(<ShowCatalog {...propsWith([mapped as ReportEntry])} />);
    expect(screen.queryByText(/Jr\./)).not.toBeInTheDocument();
  });

  it('leaves the entry unmarked when the handler person was never hydrated', () => {
    const entry = { ...dbEntry(true) };
    delete (entry as { handler_person?: unknown }).handler_person;
    const [mapped] = mapReportEntries([entry], trial);
    expect(mapped?.handlerIsJunior).toBeUndefined();
  });
});
