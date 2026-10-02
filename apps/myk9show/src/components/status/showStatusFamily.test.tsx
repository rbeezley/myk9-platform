import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { ShowsTableView } from '@/components/shows/browse/ShowsTableView';
import { getStatusDescriptor, getStatusSurfaceClasses } from './statusIconGrammar';

// MYK9-929, M5: a show's status has ONE family in the shared grammar: one label and one color
// per status, whether it is drawn in the table or in the header pill.

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

const SHOW_STATUSES = [
  ['draft', 'Draft'],
  ['published', 'Published'],
  ['upcoming', 'Upcoming'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['archived', 'Archived'],
] as const;

describe('show status family', () => {
  it.each(SHOW_STATUSES)('%s reads "%s"', (status, label) => {
    expect(getStatusDescriptor('show', status).label).toBe(label);
  });

  it('gives each status one colour, and the table "Completed" is the same green as the pill', () => {
    expect(getStatusDescriptor('show', 'completed').colorClass).toBe('text-success');
    expect(getStatusDescriptor('show', 'cancelled').colorClass).toBe('text-destructive');
    expect(getStatusDescriptor('show', 'in_progress').colorClass).toBe('text-info');
    // Completed was green in the table and grey in the pill (M5): it is one thing now.
    expect(getStatusSurfaceClasses('show', 'completed')).toContain('text-success');
  });

  it('reads an unknown status as "No Status" rather than throwing', () => {
    expect(getStatusDescriptor('show', 'made_up').label).toBe('No Status');
    expect(getStatusDescriptor('show', null).label).toBe('No Status');
  });
});

function makeShow(status: string): EnhancedShow {
  return {
    id: `show-${status}`,
    name: `Show ${status}`,
    organization: 'AKC',
    startDate: '2099-10-20',
    endDate: '2099-10-22',
    location: 'Camp Loughridge, Tulsa, OK',
    status,
    events: [],
    clubName: 'Club',
    userHasEntries: false,
  } as unknown as EnhancedShow;
}

describe('Managing shows table status column', () => {
  it('shows a Status column to a manager, drawn from the shared family', () => {
    render(
      <MemoryRouter>
        <ShowsTableView
          shows={[makeShow('completed'), makeShow('in_progress')]}
          canManageShow={() => true}
          isSelected={() => false}
          onToggleSelect={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Sentence case, the same word the pill uses.
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('keeps Status off the public table', () => {
    render(
      <MemoryRouter>
        <ShowsTableView shows={[makeShow('completed')]} canManageShow={() => false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('columnheader', { name: /status/i })).not.toBeInTheDocument();
  });
});
