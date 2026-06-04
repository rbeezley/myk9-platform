import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';

vi.mock('../hooks/useExampleIds', () => ({
  useExampleIds: () => ({
    data: { showId: 'SHOW_1', dogId: 'DOG_1' },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('../components/PageFlowDiagram', () => ({
  PageFlowDiagram: ({ pages }: { pages: unknown[] }) => (
    <div data-testid="page-flow-diagram" data-page-count={String(pages.length)} />
  ),
}));

vi.mock('../data/pageDirectory', async () => {
  const { UserRole } = await import('@/types/auth-types');
  return {
    pageDirectory: [
      {
        path: '/admin/dashboard',
        title: 'Admin Dashboard',
        description: 'Admin overview page.',
        roles: [UserRole.SITE_ADMIN],
        classification: 'critical-path',
        category: 'Admin',
        status: 'working',
      },
      {
        path: '/exhibitor/entries',
        title: 'My Shows',
        description: 'Exhibitor show hub.',
        roles: [UserRole.EXHIBITOR],
        classification: 'critical-path',
        category: 'Entries',
        status: 'working',
      },
      {
        path: '/calendar',
        title: 'Calendar',
        description: 'Parked calendar view.',
        roles: [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN],
        classification: 'park',
        category: 'Public',
        status: 'working',
      },
    ],
  };
});

import { AdminHelpPage } from '../components/AdminHelpPage';

describe('AdminHelpPage', () => {
  it('hides parked entries by default', () => {
    render(<AdminHelpPage />);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Shows')).toBeInTheDocument();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
  });

  it('shows parked entries when the toggle is enabled', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByRole('checkbox', { name: /show parked/i }));
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
  });

  it('filters by search term across title and description', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.type(screen.getByPlaceholderText(/search pages/i), 'exhibitor');
    expect(screen.getByText('My Shows')).toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });
});

describe('AdminHelpPage — view toggle', () => {
  beforeEach(() => localStorage.clear());

  it('renders ViewToggle with list and flow modes', () => {
    render(<AdminHelpPage />);
    expect(screen.getByTitle('List view')).toBeInTheDocument();
    expect(screen.getByTitle('Flow view')).toBeInTheDocument();
  });

  it('shows list accordion by default, not PageFlowDiagram', () => {
    render(<AdminHelpPage />);
    expect(screen.queryByTestId('page-flow-diagram')).not.toBeInTheDocument();
  });

  it('mounts PageFlowDiagram when Flow mode is selected', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByTitle('Flow view'));
    expect(screen.getByTestId('page-flow-diagram')).toBeInTheDocument();
  });

  it('persists view mode to localStorage', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByTitle('Flow view'));
    expect(localStorage.getItem('view-pref-admin-help')).toBe('flow');
  });
});
