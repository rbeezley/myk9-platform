import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import type { SecretaryEntry } from '@/services/database/entries';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { secretaryEntryToRawRow } from '../useClassDetailsData';
import { buildRunSheetEntries } from './buildRunSheetEntries';
import { RunSheetRow } from './RunSheetRow';

/**
 * MYK9-1049: the class page must show the stored placement on each scored row.
 * Drives the real hops (secretary entry -> raw row -> run-sheet entry -> row) so a
 * field dropped by a hand-written projection is caught (LESSONS `last-hop-drop`).
 */
function renderRow(overrides: Partial<SecretaryEntry>) {
  const secretaryEntry = {
    id: 'e1',
    dog_id: 'd1',
    class_id: 'c1',
    show_id: 's1',
    handler: 'Alex Handler',
    armband: '101',
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    run_order: 1,
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 42.5,
    total_faults: 0,
    final_placement: null,
    dog: null,
    ...overrides,
  } as SecretaryEntry;
  const [entry] = buildRunSheetEntries([secretaryEntryToRawRow(secretaryEntry)]);
  render(<RunSheetRow entry={entry!} onScoreEntry={vi.fn()} onCheckInStatus={vi.fn()} />);
}

describe('class page run sheet placement', () => {
  it('shows the stored placement on a scored row', () => {
    renderRow({ final_placement: 1 });
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
  });

  it('renders the stored rank exactly as held', () => {
    renderRow({ final_placement: 2 });
    expect(screen.getByText('2nd')).toBeInTheDocument();
  });

  it('shows no placement when none is stored', () => {
    renderRow({ final_placement: null });
    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+(st|nd|rd|th)$/)).not.toBeInTheDocument();
  });

  it('keeps the placement of a view_authenticated_entry_results row through the replica', () => {
    const empty = {
      dogsMap: new Map(),
      classesMap: new Map(),
      armbandsByEntryId: new Map(),
      armbandsByDogId: new Map(),
      peopleMap: new Map(),
      enrollmentsMap: new Map(),
      trialsMap: new Map(),
      pullMetadataMap: new Map(),
    } as unknown as Parameters<typeof toSecretaryEntry>[1];
    const secretaryEntry = toSecretaryEntry(
      rowToEntry({
        id: 'e1',
        dog_id: 'd1',
        class_id: 'c1',
        show_id: 's1',
        entry_status: 'confirmed',
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 45.2,
        final_placement: 1,
        check_in_status: 'checked-in',
      } as never),
      empty
    );
    const [entry] = buildRunSheetEntries([secretaryEntryToRawRow(secretaryEntry)]);
    render(<RunSheetRow entry={entry!} onScoreEntry={vi.fn()} onCheckInStatus={vi.fn()} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });
});
