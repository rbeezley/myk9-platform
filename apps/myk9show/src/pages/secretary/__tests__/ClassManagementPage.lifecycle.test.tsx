import { render, screen, within } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

// UX walk remediation 2.B: the Manage Classes chip must render the derived
// lifecycle label ("Not started" / "In Progress" / "Completed"), never the raw
// enum ("in_progress") or "No Status"; draft/unpublished shows render no chip;
// the summary tiles count by derived lifecycle, not a single raw enum value.

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useUpdateClassMutationMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
const useJudgesWithQualificationsMock = vi.hoisted(() => vi.fn());
const useShowQueryMock = vi.hoisted(() => vi.fn());
const useSecretaryShowEntriesQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: useUpdateClassMutationMock,
  useDeleteClassMutation: useDeleteClassMutationMock,
  classKeys: {
    all: ['classes'],
    byTrial: (trialId: string) => ['classes', 'trial', trialId],
  },
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: useShowQueryMock,
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: useSecretaryShowEntriesQueryMock,
}));

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: useJudgesWithQualificationsMock,
}));

vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: vi.fn(),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: { getTrialById: (trialId: string) => unknown }) => unknown) =>
    selector({
      getTrialById: () => ({ id: 'trial-1', showId: 'show-1', name: 'Saturday Trial' }),
    }),
}));

const classRows = [
  { id: 'class-1', name: 'Container Novice A', element: 'Container', level: 'Novice',
    section: 'A', status: 'scheduled', class_order: 1, max_entries: 50, entries: [], judge_assignments: [] },
  { id: 'class-2', name: 'Interior Novice A', element: 'Interior', level: 'Novice',
    section: 'A', status: 'upcoming', class_order: 2, max_entries: 50, entries: [], judge_assignments: [] },
  { id: 'class-3', name: 'Buried Master', element: 'Buried', level: 'Master',
    section: 'A', status: 'in_progress', class_order: 3, max_entries: 50, entries: [], judge_assignments: [] },
  { id: 'class-4', name: 'Exterior Excellent', element: 'Exterior', level: 'Excellent',
    section: 'A', status: 'completed', class_order: 4, max_entries: 50, entries: [], judge_assignments: [] },
];

function renderPage() {
  return render(
    <Routes>
      <Route path="/shows/:id/classes/:trialId" element={<ClassManagementPage />} />
    </Routes>,
    { initialRoute: '/shows/show-1/classes/trial-1' }
  );
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('[data-class-id]');
  if (!row) throw new Error(`row not found for ${name}`);
  return row as HTMLElement;
}

/** Read a summary-tile count by its label (the tile number is the label's previous sibling). */
function tileCount(label: string): string | undefined {
  return screen
    .getAllByText(label)
    .map(el => el.previousElementSibling)
    .find(prev => prev?.className.includes('text-2xl'))?.textContent ?? undefined;
}

describe('ClassManagementPage lifecycle chips (2.B)', () => {
  beforeEach(() => {
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
    useUpdateClassMutationMock.mockReturnValue({ mutate: vi.fn() });
    useDeleteClassMutationMock.mockReturnValue({ mutate: vi.fn() });
    useJudgesWithQualificationsMock.mockReturnValue({ data: [] });
    useShowQueryMock.mockReturnValue({ data: { id: 'show-1', status: 'published' } });
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `entry-${index + 1}`,
        show_id: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
      })),
      isLoading: false,
      isError: false,
    });
  });

  it('renders the derived label, never the raw enum', () => {
    renderPage();
    expect(within(rowFor('Buried Master')).getByText('In Progress')).toBeVisible();
    expect(within(rowFor('Buried Master')).queryByText('in_progress')).toBeNull();
    expect(within(rowFor('Container Novice A')).getByText('Not started')).toBeVisible();
    expect(within(rowFor('Exterior Excellent')).getByText('Completed')).toBeVisible();
  });

  it('hides lifecycle chips entirely on a draft show', () => {
    useShowQueryMock.mockReturnValue({ data: { id: 'show-1', status: 'draft' } });
    renderPage();
    expect(within(rowFor('Buried Master')).queryByText('In Progress')).toBeNull();
    expect(within(rowFor('Container Novice A')).queryByText('Not started')).toBeNull();
  });

  it('counts summary tiles by derived lifecycle (upcoming + scheduled both count as Not started)', () => {
    renderPage();
    expect(tileCount('Not started')).toBe('2');
    expect(tileCount('In Progress')).toBe('1');
    expect(tileCount('Completed')).toBe('1');
  });

  it('announces summary lifecycle labels once through visible text', () => {
    renderPage();
    expect(screen.queryByRole('img', { name: 'Not started' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'In Progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument();
  });

  it('derives each class entry total from the shared show-scoped entry rows', () => {
    renderPage();

    expect(within(rowFor('Container Novice A')).getByText('Entries: 8/50')).toBeVisible();
  });

  it('shows an unavailable count instead of a false zero while shared entries cannot load', () => {
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('Offline with no cached entries'),
    });

    renderPage();

    expect(
      within(rowFor('Container Novice A')).getByLabelText('Entry count unavailable')
    ).toHaveTextContent('Entries: —');
    expect(within(rowFor('Container Novice A')).queryByText('Entries: 0/50')).toBeNull();
  });

  it('keeps cached entry counts visible when a background refresh fails', () => {
    const cachedEntries = useSecretaryShowEntriesQueryMock().data;
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: cachedEntries,
      isLoading: false,
      isError: true,
      error: new Error('Refresh failed'),
    });

    renderPage();

    expect(within(rowFor('Container Novice A')).getByText('Entries: 8/50')).toBeVisible();
  });
});
