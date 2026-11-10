import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ShowDetailsDialog from '../ShowDetailsDialog';
import type { Competition } from '@/types/competition-types';

function renderWithStatus(status: string) {
  const show = { name: 'Spring Show', location: 'Fairgrounds', status } as unknown as Competition;
  render(<ShowDetailsDialog open show={show} onClose={vi.fn()} />);
}

describe('ShowDetailsDialog status', () => {
  it('prints a stored show status in plain words', () => {
    renderWithStatus('in_progress');
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByText('in_progress')).not.toBeInTheDocument();
  });

  it('prints a status the show vocabulary lacks as stored', () => {
    renderWithStatus('Upcoming');
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });
});
