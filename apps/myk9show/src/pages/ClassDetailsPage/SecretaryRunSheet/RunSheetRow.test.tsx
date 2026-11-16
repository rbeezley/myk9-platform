import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import { RunSheetRow } from './RunSheetRow';
import type { RunSheetEntry } from './types';

const entry: RunSheetEntry = {
  id: 'entry-1',
  runOrder: 1,
  dogName: 'Scout',
  armband: '101',
  breed: 'Beagle',
  handlerName: 'Jordan Lee',
  ownerName: 'Jordan Lee',
  checkInStatus: 'checked-in',
  isCheckedIn: true,
  isScratched: false,
  isScored: false,
  result: null,
};

describe('RunSheetRow', () => {
  it('renders the selected check-in status through the shared entry icon grammar', () => {
    const { container } = render(
      <RunSheetRow entry={entry} onScoreEntry={vi.fn()} onCheckInStatus={vi.fn()} />
    );

    const icon = container.querySelector('[data-family="entry"][data-status="checked-in"]');
    expect(icon).toHaveAttribute('data-shape', 'in-progress');
    expect(icon).toHaveClass('text-info');
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.queryByText('checked-in')).not.toBeInTheDocument();
  });

  it('shows the element time next to the time only when the run has one (MYK9-2089)', () => {
    const scored = (elementTimeStr: string): RunSheetEntry => ({
      ...entry,
      isScored: true,
      result: {
        outcome: 'qualified',
        qualified: true,
        timeStr: '1:01.23',
        elementTimeStr,
        faults: 0,
        placement: 1,
        judgeNotes: '',
      },
    });
    const { rerender } = render(
      <RunSheetRow entry={scored('0:42.50')} onScoreEntry={vi.fn()} onCheckInStatus={vi.fn()} />
    );
    expect(screen.getByText('1:01.23')).toBeInTheDocument();
    expect(screen.getByText('Element 0:42.50')).toBeInTheDocument();

    rerender(<RunSheetRow entry={scored('')} onScoreEntry={vi.fn()} onCheckInStatus={vi.fn()} />);
    expect(screen.queryByText(/Element/)).not.toBeInTheDocument();
  });
});
