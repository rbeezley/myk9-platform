import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useUpdateClassMutationMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
const useJudgesWithQualificationsMock = vi.hoisted(() => vi.fn());
const upsertClassJudgeAssignmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: useUpdateClassMutationMock,
  useDeleteClassMutation: useDeleteClassMutationMock,
  classKeys: {
    all: ['classes'],
    byTrial: (trialId: string) => ['classes', 'trial', trialId],
  },
}));

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: useJudgesWithQualificationsMock,
}));

vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: upsertClassJudgeAssignmentMock,
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: { getTrialById: (trialId: string) => unknown }) => unknown) =>
    selector({
      getTrialById: () => ({
        id: 'trial-1',
        showId: 'show-1',
        name: 'Saturday Trial',
      }),
    }),
}));

const classRows = [
  {
    id: 'class-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    class_order: 1,
    max_entries: 50,
    entries: [],
    judge_assignments: [],
  },
];

describe('ClassManagementPage judge assignment', () => {
  beforeEach(() => {
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
    useUpdateClassMutationMock.mockReturnValue({ mutate: vi.fn() });
    useDeleteClassMutationMock.mockReturnValue({ mutate: vi.fn() });
    useJudgesWithQualificationsMock.mockReturnValue({
      data: [
        {
          id: 'judge-1',
          firstName: 'Alex',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active' }],
        },
        {
          id: 'judge-2',
          firstName: 'Bailey',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active' }],
        },
      ],
    });
    upsertClassJudgeAssignmentMock.mockResolvedValue(undefined);
  });

  it('renders inline judge assignment and writes the selected class judge', async () => {
    const user = userEvent.setup();

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    const row = screen.getByText('Container Novice A').closest('[data-class-id="class-1"]');
    expect(row).not.toBeNull();
    const judgeSelect = within(row as HTMLElement).getByRole('combobox', {
      name: /judge for container novice a/i,
    });

    await user.click(judgeSelect);
    await user.click(await screen.findByRole('option', { name: 'Bailey Judge' }));

    await waitFor(() => {
      expect(upsertClassJudgeAssignmentMock).toHaveBeenCalledWith('show-1', 'class-1', 'judge-2');
    });
  });

  it('uses show-scoped workbench links instead of browser-history back navigation', () => {
    render(
      <Routes>
        <Route path="/shows/:id/classes/:trialId" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/shows/show-1/classes/trial-1' }
    );

    expect(screen.getByRole('navigation', { name: 'Class management breadcrumb' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Show setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
    );
    expect(screen.getByRole('link', { name: 'Back to Setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
    );
    expect(screen.getByRole('link', { name: 'Back to Setup' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByRole('link', { name: 'Manage Waitlist' })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management?tab=waitlist&trial=trial-1'
    );
    expect(screen.getByRole('link', { name: 'Manage Waitlist' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByRole('link', { name: 'Add Classes' })).toHaveAttribute(
      'href',
      '/shows/show-1/classes/trial-1/create'
    );
    expect(screen.getByRole('link', { name: 'Add Classes' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByText('Saturday Trial')).toHaveClass('truncate');
    expect(screen.getByText('Saturday Trial')).toHaveAttribute('title', 'Saturday Trial');
    expect(screen.queryByRole('button', { name: 'Back to Trial' })).not.toBeInTheDocument();
  });
});
