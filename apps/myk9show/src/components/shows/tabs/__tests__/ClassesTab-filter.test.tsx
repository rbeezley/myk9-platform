import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassesTab } from '../ClassesTab';

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
// list-toolkit `ListViewTabs` (MYK9-811, a labelled select since MYK9-906): a
// fixed All/Pending/Completed/Mine set, always shown, matching every other kit-rollout surface (Users,
// Class Management) rather than hiding itself when every row shares a status.
describe('ClassesTab views (list toolkit)', () => {
  it('always shows the Show select, even when every class shares a status', async () => {
    const user = userEvent.setup();
    renderTab([makeClass(), makeClass()]);
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    expect(await screen.findByRole('option', { name: /^Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Completed/ })).toBeInTheDocument();
  });

  it('offers every view when classes have mixed statuses', async () => {
    const user = userEvent.setup();
    renderTab([makeClass({ status: 'Scheduled' }), makeClass({ status: 'Completed' })]);
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    expect(await screen.findByRole('option', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Completed/ })).toBeInTheDocument();
  });

  it('filters to show only pending classes', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^Pending/ }));
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
  });

  it('filters to show only completed classes', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^Completed/ }));
    expect(screen.queryByText('Interior')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('"All" view re-shows everything', async () => {
    const user = userEvent.setup();
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^Pending/ }));
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });
});
