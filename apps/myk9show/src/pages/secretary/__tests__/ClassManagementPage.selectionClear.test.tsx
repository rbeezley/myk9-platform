import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { ClassManagementPage } from '../ClassManagementPage';

const classes = [
  { id: 'c1', name: 'Novice A', element: 'Container', level: 'Novice', status: 'scheduled', class_order: 1, max_entries: null, entries: [] },
  { id: 'c2', name: 'Novice B', element: 'Interior', level: 'Novice', status: 'in_progress', class_order: 2, max_entries: null, entries: [] },
];

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({ data: classes, isLoading: false }),
  useUpdateClassMutation: () => ({ mutate: vi.fn() }),
  useDeleteClassMutation: () => ({ mutate: vi.fn() }),
  classKeys: { byTrial: (id: string) => ['classes', 'trial', id] },
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { status: 'published' } }),
}));

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: vi.fn(),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (s: { getTrialById: () => null }) => unknown) =>
    selector({ getTrialById: () => null }),
}));

function renderPage(initialRoute: string) {
  const queryClient = createTestQueryClient();
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe('ClassManagementPage selection clearing on view-identity change', () => {
  it('clears bulk selection when the status filter (preset tile) changes', async () => {
    const { user } = renderPage('/trials/t1/classes');

    const rowCheckbox = await screen.findByRole('checkbox', { name: 'Select Novice A' });
    await user.click(rowCheckbox);

    // Bulk actions bar should now be visible with 1 selected.
    expect(await screen.findByText('1 class selected')).toBeInTheDocument();

    // Click the "Completed" preset tile — this changes the status filter (view identity).
    const completedTile = screen.getByText('Completed').closest('[role="button"]');
    expect(completedTile).not.toBeNull();
    await user.click(completedTile as HTMLElement);

    // Selection must be cleared — the bulk actions bar/count should disappear.
    expect(screen.queryByText('1 class selected')).not.toBeInTheDocument();
  });
});
