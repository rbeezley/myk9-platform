import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FaultsCell } from '../FaultsCell';
import { buildResultRows } from '../resultRows';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { QualificationCell } from '../QualificationCell';
import { PodiumPosition } from '@/components/results/PodiumPosition';
import { RESULTS_PRIVATE_LABEL, PRIVATE_ENTRY_LABEL } from '@/lib/resultsPrivacy';
import { makeRow } from './rowFixture';

describe('"Results private" rendering (MYK9-969)', () => {
  it('a scored entry whose results the server hid reads "Results private", not "Not Set"', () => {
    render(<QualificationCell item={makeRow({ resultsPrivate: true })} visible />);
    expect(screen.getByText(RESULTS_PRIVATE_LABEL)).toBeInTheDocument();
    expect(screen.queryByText('Not Set')).not.toBeInTheDocument();
  });

  it('a visible qualification on an anonymised row still shows (it names no one)', () => {
    render(
      <QualificationCell
        item={makeRow({ resultsPrivate: true, qualification: 'Qualified' })}
        visible
      />
    );
    expect(screen.queryByText(RESULTS_PRIVATE_LABEL)).not.toBeInTheDocument();
  });

  it('an unscored public row is unchanged', () => {
    render(<QualificationCell item={makeRow()} visible />);
    expect(screen.getByText('Not Set')).toBeInTheDocument();
  });

  it('the podium shows "Private entry" at its place with no handler, breed or quotes', () => {
    render(
      <PodiumPosition
        placement={1}
        handlerName=""
        dogName={PRIVATE_ENTRY_LABEL}
        breed=""
        armband={null}
        isPrivate
      />
    );
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText(PRIVATE_ENTRY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(/“Private entry”/)).not.toBeInTheDocument();
  });

  // Review finding (MYK9-969): a private result's faults arrive NULL because
  // they are withheld; the table used to show a fabricated "0".
  it("a private row's withheld faults render as withheld, never as 0", () => {
    const raw = {
      id: 'e1',
      class_id: 'c1',
      show_id: 's1',
      dog_id: 'd1',
      handler_id: null,
      armband: '101',
      handler: 'Alice Smith',
      result_status: null,
      is_scored: true,
      search_time_seconds: null,
      total_faults: null,
      final_placement: null,
      judge_notes: null,
      disqualification_reason: null,
      scoring_completed_at: null,
      check_in_status: 'checked-in',
      run_order: 1,
      dog: null,
      created_at: null,
      updated_at: null,
      results_private: true,
    } satisfies RawEntryRow;
    const row = buildResultRows([{ id: 'e1' } as ScentWorkEntry], [raw])[0]!;
    expect(row.faults).toBe('');
    expect(row.resultsPrivate).toBe(true);

    render(<FaultsCell item={row} visible />);
    expect(screen.getByLabelText(RESULTS_PRIVATE_LABEL)).toHaveTextContent('—');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('a public row with no faults recorded still reads 0', () => {
    const rows = buildResultRows([{ id: 'e2' } as ScentWorkEntry], []);
    expect(rows[0]!.faults).toBe('0');
  });
});
