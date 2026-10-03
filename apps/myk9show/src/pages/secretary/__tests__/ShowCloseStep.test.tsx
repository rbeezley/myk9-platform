import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import ShowCloseStep from '../ShowCloseStep';

const entriesState = vi.hoisted(() => ({
  value: {
    data: undefined as unknown[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

const trialStoreState = vi.hoisted(() => ({
  trials: [
    { id: 'trial-1', showId: 'show-1', status: 'active', trialDate: '2026-10-10' },
    { id: 'trial-other', showId: 'show-2', status: 'active', trialDate: '2026-10-10' },
  ],
  trialClasses: {
    'trial-1': [
      { id: 'class-1', status: 'completed' },
      { id: 'class-2', status: '' },
    ],
  } as Record<string, Array<{ id: string; status: string }>>,
  trialsReadStatus: 'success',
  trialsHasConfirmedSnapshot: true,
  trialClassesReadStatus: 'success',
  trialClassesHasConfirmedSnapshot: true,
  loadTrials: vi.fn(),
  loadTrialClasses: vi.fn(),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: typeof trialStoreState) => unknown) =>
    selector(trialStoreState),
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', status: 'active', startDate: '2026-10-10', endDate: '2026-10-11' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => entriesState.value,
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: [{ status: 'sent', trial_id: 'trial-1' }] }),
}));

vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => []),
}));

vi.mock('@/features/show-workbench/ShowCloseoutSummary', () => ({
  ShowCloseoutSummary: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="closeout-summary">{entries.length}</div>
  ),
}));

vi.mock('@/features/show-workbench/CloseOutShowAction', () => ({
  CloseOutShowAction: (props: {
    show: unknown;
    trials: unknown[];
    classes: unknown[];
    submissions: unknown[];
  }) => (
    <pre data-testid="close-action">
      {JSON.stringify({
        show: props.show,
        trials: props.trials,
        classes: props.classes,
        submissions: props.submissions,
      })}
    </pre>
  ),
}));

function renderStep() {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ShowCloseStep />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?step=close' }
  );
}

function closeActionProps() {
  return JSON.parse(screen.getByTestId('close-action').textContent ?? '{}');
}

describe('ShowCloseStep (Results step 3, MYK9-954)', () => {
  beforeEach(() => {
    entriesState.value = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  });

  it('feeds the unchanged summary and close action from this show only', () => {
    entriesState.value.data = [
      { id: 'e1', class_id: 'class-1', is_scored: true },
      { id: 'e2', class_id: 'class-1', is_scored: false },
    ];

    renderStep();

    expect(screen.getByTestId('closeout-summary')).toHaveTextContent('2');
    expect(closeActionProps()).toEqual({
      show: { id: 'show-1', status: 'active' },
      trials: [{ id: 'trial-1', status: 'active' }],
      classes: [
        { id: 'class-1', status: 'completed', entryCount: 2, scoredCount: 1 },
        { id: 'class-2', status: 'Scheduled', entryCount: 0, scoredCount: 0 },
      ],
      submissions: [{ status: 'sent', trial_id: 'trial-1' }],
    });
    // The Show Day tool's shortcut buttons were dropped: this page is Results.
    expect(screen.queryByRole('link', { name: /submit results/i })).toBeNull();
  });

  it('reports counts as unknown, never zero, when the entries read has no data', () => {
    renderStep();

    expect(screen.getByText(/entry data isn.t available/i)).toBeInTheDocument();
    expect(closeActionProps().classes).toEqual([
      { id: 'class-1', status: 'completed', entryCount: null, scoredCount: null },
      { id: 'class-2', status: 'Scheduled', entryCount: null, scoredCount: null },
    ]);
  });

  it('pauses the closeout when the entries read failed', () => {
    entriesState.value.isError = true;

    renderStep();

    expect(screen.getByText("Couldn't load show entries.")).toBeInTheDocument();
    expect(screen.queryByTestId('close-action')).toBeNull();
  });
});
