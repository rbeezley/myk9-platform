import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { ClassManagementPage } from '../ClassManagementPage';

const classes = [
  {
    id: 'c1',
    name: 'Novice A',
    element: 'Container',
    level: 'Novice',
    status: 'scheduled',
    class_order: 1,
    max_entries: null,
    entries: [],
  },
  {
    id: 'c2',
    name: 'Novice B',
    element: 'Interior',
    level: 'Novice',
    status: 'in_progress',
    class_order: 2,
    max_entries: null,
    entries: [],
  },
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

function SearchProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderPage(initialRoute: string) {
  return {
    ...render(
      <Routes>
        <Route
          path="/trials/:trialId/classes"
          element={
            <>
              <ClassManagementPage />
              <SearchProbe />
            </>
          }
        />
      </Routes>,
      { initialRoute }
    ),
    user: userEvent.setup(),
  };
}

describe('ClassManagementPage selection clearing on view-identity change', () => {
  it('clears bulk selection when the status filter (preset tile) changes', async () => {
    const { user } = renderPage('/trials/t1/classes');

    const rowCheckbox = await screen.findByRole('checkbox', { name: 'Select Novice A' });
    await user.click(rowCheckbox);

    // Bulk actions bar should now be visible with 1 selected.
    expect(await screen.findByText('1 class selected')).toBeInTheDocument();

    // Select the "Completed" view tab — this changes the status filter (view identity).
    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^Completed/ }));

    // Selection must be cleared — the bulk actions bar/count should disappear.
    expect(screen.queryByText('1 class selected')).not.toBeInTheDocument();
  });

  it('"Show all classes" resets status, element and search in one URL update', async () => {
    const { user } = renderPage('/trials/t1/classes?status=completed&element=Interior&search=zzz');

    await user.click(await screen.findByRole('button', { name: 'Show all classes' }));

    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  it('names the lifecycle status when a search makes the view Custom, and Show all clears it', async () => {
    const { user } = renderPage('/trials/t1/classes?status=in_progress&search=zzz');

    expect(await screen.findByRole('status')).toHaveTextContent(
      /\(Status: In progress, matching \u201czzz\u201d\)/
    );
    await user.click(screen.getByRole('button', { name: 'Show all classes' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });
});
