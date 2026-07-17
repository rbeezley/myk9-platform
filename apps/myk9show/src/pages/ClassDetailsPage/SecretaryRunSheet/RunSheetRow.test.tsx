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
});
