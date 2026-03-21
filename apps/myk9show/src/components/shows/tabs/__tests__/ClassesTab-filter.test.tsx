import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassesTab } from '../ClassesTab';

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
    </MemoryRouter>,
  );
}

describe('ClassesTab status filter', () => {
  it('hides StatusFilter when all classes share the same status', () => {
    renderTab([makeClass(), makeClass()]);
    // StatusFilter hides itself when all items are same status
    expect(screen.queryByRole('button', { name: /Pending/ })).not.toBeInTheDocument();
  });

  it('shows StatusFilter when classes have mixed statuses', () => {
    renderTab([
      makeClass({ status: 'Scheduled' }),
      makeClass({ status: 'Completed' }),
    ]);
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completed/ })).toBeInTheDocument();
  });

  it('filters to show only pending classes', async () => {
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    // Click the Pending filter button
    await userEvent.click(screen.getByRole('button', { name: /Pending/ }));
    // Interior should still be visible, Exterior should be filtered out
    // Use table cells to find class data
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
  });

  it('filters to show only completed classes', async () => {
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    // Click the Completed filter button (in the StatusFilter toolbar, not the table badge)
    const filterButtons = screen.getAllByRole('button');
    const completedFilterBtn = filterButtons.find(
      btn => btn.textContent?.includes('Completed') && btn.textContent?.includes('('),
    )!;
    await userEvent.click(completedFilterBtn);
    expect(screen.queryByText('Interior')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('"All" filter re-shows everything', async () => {
    renderTab([
      makeClass({ element: 'Interior', status: 'Scheduled' }),
      makeClass({ element: 'Exterior', status: 'Completed' }),
    ]);
    // First filter to pending
    await userEvent.click(screen.getByRole('button', { name: /Pending/ }));
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
    // Then click All to reset
    const allButtons = screen.getAllByRole('button');
    const allFilterBtn = allButtons.find(
      btn => btn.textContent?.includes('All') && btn.textContent?.includes('('),
    )!;
    await userEvent.click(allFilterBtn);
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });
});
