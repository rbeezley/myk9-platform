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

const submissionsState = vi.hoisted(() => ({
  value: {
    data: [{ status: 'sent', trial_id: 'trial-1' }] as unknown[] | undefined,
    isError: false,
    refetch: vi.fn(),
  },
}));

const incidentsMock = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));

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
  useResultSubmissions: () => submissionsState.value,
}));

vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: incidentsMock,
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
    submissionsState.value = {
      data: [{ status: 'sent', trial_id: 'trial-1' }],
      isError: false,
      refetch: vi.fn(),
    };
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue([]);
  });

  it('feeds the unchanged summary and close action from this show only', async () => {
    entriesState.value.data = [
      { id: 'e1', class_id: 'class-1', is_scored: true },
      { id: 'e2', class_id: 'class-1', is_scored: false },
    ];

    renderStep();

    expect(await screen.findByTestId('close-action')).toBeInTheDocument();
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

  it('reports counts as unknown, never zero, when the entries read has no data', async () => {
    renderStep();

    expect(await screen.findByTestId('close-action')).toBeInTheDocument();
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

  // Review of #2681: an unread incident log or submissions list defaulted to
  // empty, so the readiness check silently dropped the "reportable incidents"
  // concern and claimed "No result submission has been recorded".
  it('holds the close action until incidents and submissions have been read', async () => {
    incidentsMock.mockImplementation(() => new Promise(() => {}));
    submissionsState.value = { data: undefined, isError: false, refetch: vi.fn() };

    renderStep();

    expect(screen.getByTestId('closeout-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('close-action')).toBeNull();
    expect(screen.getByText(/checking incidents and result submissions/i)).toBeInTheDocument();
  });

  it('says so, with a retry, when incidents or submissions could not be read', async () => {
    incidentsMock.mockRejectedValue(new Error('offline'));
    const retrySubmissions = vi.fn();
    submissionsState.value = { data: undefined, isError: true, refetch: retrySubmissions };

    const { user } = renderStep();

    expect(
      await screen.findByText(/couldn.t check incidents and result submissions/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('close-action')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retrySubmissions).toHaveBeenCalled();
  });
});
