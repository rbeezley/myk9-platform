import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassesTab } from '../ClassesTab';

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: false }),
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => false,
  }),
}));

function makeClass(overrides: Record<string, unknown> = {}) {
  return {
    id: `cls-${Math.random()}`,
    name: 'Interior Novice',
    element: 'Interior',
    level: 'Novice',
    section: '',
    judgeName: 'Judge A',
    trialId: 'trial-1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled' as const,
    entryCount: 5,
    scoredCount: 0,
    userHasEntry: false,
    trialDate: '2026-03-20',
    trialNumber: '1',
    trialName: 'Trial 1',
    ...overrides,
  };
}

function renderTab(classes: ReturnType<typeof makeClass>[]) {
  return render(
    <MemoryRouter>
      <ClassesTab classes={classes} showId="show-1" userHasEntries={false} />
    </MemoryRouter>
  );
}

// The bespoke, self-hiding `StatusFilter` was replaced by the shared
// list-toolkit `ListViewTabs` (MYK9-811): a fixed All/Pending/Completed/Mine
// set, always shown, matching every other kit-rollout surface (Users,
// Class Management) rather than hiding itself when every row shares a status.
describe('ClassesTab views (list toolkit)', () => {
  it('always shows the view tabs, even when every class shares a status', () => {
    renderTab([makeClass(), makeClass()]);
    expect(screen.getByRole('button', { name: /^Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Completed/ })).toBeInTheDocument();
  });

  it('shows the view tabs when classes have mixed statuses', () => {
    renderTab([makeClass({ status: 'Scheduled' }), makeClass({ status: 'Completed' })]);
    expect(screen.getByRole('button', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Completed/ })).toBeInTheDocument();
  });

  it('filters to show only pending classes', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('button', { name: /^Pending/ }));
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
  });

  it('filters to show only completed classes', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('button', { name: /^Completed/ }));
    expect(screen.queryByText('Interior')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('"All" view re-shows everything', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('button', { name: /^Pending/ }));
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });
});
