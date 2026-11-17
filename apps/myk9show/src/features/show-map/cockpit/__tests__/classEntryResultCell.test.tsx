import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { buildShowMapTree } from '../../showMapTree';
import { ClassEntryResultCell } from '../ClassEntryResultCell';
import { classEntriesForClass } from '../cockpitClassEntries';

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as never;
const trial = { id: 'trial-1', trialDate: '2026-07-20', trialNumber: '1' } as never;
const cls = { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as never;

/** A replicated entry row (snake_case, as the run sheet reads it) through the real tree. */
function renderCell(fields: Record<string, unknown>) {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [cls],
    entries: [
      {
        id: 'e1',
        class_id: 'class-1',
        entry_status: 'confirmed',
        armband: '101',
        run_order: 1,
        dog: { call_name: 'Piper' },
        ...fields,
      },
    ],
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  const [entry] = classEntriesForClass('class-1', tree);
  render(<ClassEntryResultCell entry={entry!} />);
}

describe('the Show Desk result cell', () => {
  it('shows a scored Q with its time, faults, element time and stored placement', () => {
    renderCell({
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 61.23,
      element_time_seconds: 30.1,
      total_faults: 0,
      final_placement: 1,
    });
    const cell = screen.getByTestId('class-entry-result');
    expect(cell).toHaveTextContent('Q');
    expect(cell).toHaveTextContent('0 faults');
    expect(screen.getByText('1:01.23')).toBeInTheDocument();
    expect(screen.getByText('Element 0:30.10')).toBeInTheDocument();
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('shows an NQ with its faults and no placement or element time', () => {
    renderCell({
      is_scored: true,
      result_status: 'nq',
      search_time_seconds: 90,
      total_faults: 2,
      final_placement: null,
    });
    expect(screen.getByTestId('class-entry-result')).toHaveTextContent('NQ');
    expect(screen.getByText('2 faults')).toBeInTheDocument();
    expect(screen.getByText('1:30.00')).toBeInTheDocument();
    expect(screen.queryByText(/Element/)).toBeNull();
    expect(screen.queryByText(/^\d+(st|nd|rd|th)$/)).toBeNull();
  });

  it('shows no time or faults for a dog marked absent', () => {
    renderCell({ is_scored: true, result_status: 'absent', total_faults: 0 });
    expect(screen.getByTestId('class-entry-result')).toHaveTextContent('ABS');
    expect(screen.queryByText(/fault/)).toBeNull();
  });

  it('renders nothing for an unscored dog', () => {
    renderCell({ is_scored: false, result_status: 'pending', search_time_seconds: 40 });
    expect(screen.queryByTestId('class-entry-result')).toBeNull();
  });
});
