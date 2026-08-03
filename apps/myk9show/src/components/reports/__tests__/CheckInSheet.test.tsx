import { render, screen } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { CheckInSheet } from '../CheckInSheet';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { mapScopedReportEntries } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';

const entryBuddy: ReportEntry = {
  id: '1',
  armband: 142,
  runOrder: 2,
  callName: 'Buddy',
  breed: 'Golden Retriever',
  handler: 'Sarah Mitchell',
  registrationNumber: null,
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

const entryMax: ReportEntry = {
  id: '2',
  armband: 108,
  runOrder: 1,
  callName: 'Max',
  breed: 'German Shepherd',
  handler: 'Tom Rivera',
  registrationNumber: null,
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

const baseProps: ReportProps = {
  showName: 'Regional Scent Work Championship',
  trial: {
    date: '2026-06-15',
    trialNumber: '1',
    judgeName: 'Janet Hoover',
  },
  classData: {
    element: 'Container',
    level: 'Novice A',
    section: '',
  },
  entries: [entryBuddy, entryMax],
  sortOrder: 'run-order',
  organization: 'AKC',
  activityType: 'Scent Work',
};

describe('CheckInSheet', () => {
  it('renders the title with "Check-in" text', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Check-in');
  });

  it('renders "myK9Show" branding', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('renders trial info: formatted date, judge name, element, level', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('6/15/2026')).toBeInTheDocument();
    expect(screen.getByText('Janet Hoover')).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });

  it('renders TBD when report data marks the class as unassigned', () => {
    render(<CheckInSheet {...baseProps} trial={{ ...baseProps.trial!, judgeName: 'TBD' }} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('sorts entries by run order by default (runOrder=1 first)', () => {
    render(<CheckInSheet {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is the header, rows[1] is the first data row
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[2]).toHaveTextContent('Buddy');
  });

  it('sorts by armband when sortOrder="armband"', () => {
    render(<CheckInSheet {...baseProps} sortOrder="armband" />);
    const rows = screen.getAllByRole('row');
    // armband 108 (Max) < 142 (Buddy)
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[2]).toHaveTextContent('Buddy');
  });

  it('renders entry count in footer', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('Class Entries: 2')).toBeInTheDocument();
  });

  describe('HANDLER column, end to end from a database row (MYK9-119)', () => {
    // The fixtures above hand-build ReportEntry, so they pass however the
    // mapping behaves — the sheet shipped with every HANDLER cell blank while
    // these stayed green. This drives the real chain the page uses:
    // Supabase row -> rowToEntry -> mapReplicatedEntryToDbRow ->
    // mapScopedReportEntries -> CheckInSheet.
    const sheetFromRows = (rows: Array<Record<string, unknown>>) => {
      const entries = mapScopedReportEntries(
        rows.map(
          row =>
            mapReplicatedEntryToDbRow(rowToEntry(fromAny<EntryRow, unknown>(row)), {
              dog: {
                id: String(row.dog_id),
                name: String(row.call_name),
                callName: String(row.call_name),
                breed: 'Labrador Retriever',
              },
            }) as DbEntry
        ),
        [fromAny<DbTrial, unknown>({ id: 'trial-1', date: '2026-08-01', trial_number: 1 })],
        [{ id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice' } as DbClass],
        { kind: 'show', showId: 'show-1' }
      );

      return render(<CheckInSheet {...baseProps} entries={entries} />);
    };

    const dbRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'entry-100',
      class_id: 'class-1',
      show_id: 'show-1',
      dog_id: 'dog-1',
      call_name: 'Willow',
      armband: '100',
      entry_status: 'confirmed',
      handler_id: 'person-1',
      handler: 'Test Secretary',
      ...overrides,
    });

    it('prints the handler name instead of an empty cell', () => {
      sheetFromRows([dbRow()]);
      expect(screen.getByText('Test Secretary')).toBeInTheDocument();
    });

    it('prints a placeholder, never a blank, when no handler is recorded', () => {
      sheetFromRows([dbRow({ handler: null, handler_id: null })]);

      const dataRow = screen.getAllByRole('row')[1];
      expect(dataRow).toHaveTextContent('Unknown');
    });

    it('leaves no HANDLER cell empty across a multi-entry sheet', () => {
      sheetFromRows([
        dbRow(),
        dbRow({ id: 'entry-103', armband: '103', handler: 'Test Exhibitor' }),
        dbRow({ id: 'entry-105', armband: '105', handler: null, handler_id: null }),
      ]);

      // Last column of every data row must carry text — the exact defect was an
      // entire column of empty cells on paper the gate steward relies on.
      const handlerCells = screen
        .getAllByRole('row')
        .slice(1)
        .map(row => row.querySelectorAll('td')[5]?.textContent?.trim() ?? '');

      expect(handlerCells).toEqual(['Test Secretary', 'Test Exhibitor', 'Unknown']);
    });
  });

  it('handles empty entries array (shows 0 count)', () => {
    render(<CheckInSheet {...baseProps} entries={[]} />);
    expect(screen.getByText('Class Entries: 0')).toBeInTheDocument();
  });

  it('renders an em dash for entries without armband numbers', () => {
    render(<CheckInSheet {...baseProps} entries={[{ ...entryBuddy, armband: 0 }]} />);

    const rows = screen.getAllByRole('row');
    expect(rows[1].querySelectorAll('td')[1]).toHaveTextContent('—');
  });

  it('shows section when provided and non-empty', () => {
    const propsWithSection: ReportProps = {
      ...baseProps,
      classData: {
        ...baseProps.classData!,
        section: 'A',
      },
    };
    render(<CheckInSheet {...propsWithSection} />);
    expect(screen.getByText('Section:')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('does not show section when section is empty', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.queryByText('Section:')).not.toBeInTheDocument();
  });
});
