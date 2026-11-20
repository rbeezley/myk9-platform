import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { render } from '@/test/utils/testUtils';
import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { AffiliationSync, AssignedJudgeNote, JudgeAffiliation } from '../JudgeAffiliationField';

const mocks = vi.hoisted(() => ({
  getByShowId: vi.fn(),
  hasUnsyncedLocalWork: vi.fn(),
  subscribe: vi.fn(),
  setJudgeAffiliation: vi.fn(),
  fetchJudges: vi.fn(),
  listener: undefined as undefined | (() => void),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getByShowId: mocks.getByShowId,
    hasUnsyncedLocalWork: mocks.hasUnsyncedLocalWork,
    subscribe: mocks.subscribe,
  },
}));
vi.mock('@/services/database/judges/setJudgeAffiliation', () => ({
  setJudgeAffiliation: mocks.setJudgeAffiliation,
}));
// The real judge-list query key, so the save's cache write is exercised.
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () =>
    useQuery({ queryKey: ['judges', 'withQualifications'], queryFn: mocks.fetchJudges }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ja-1',
  personId: 'judge-1',
  showId: 'show-1',
  status: 'invited',
  ...over,
});

function renderWith(children: React.ReactNode, organization = 'ASCA') {
  const context = {
    data: { id: 'show-1', organization },
  } as unknown as EditPanelContextValue;
  return render(
    <EditPanelContext.Provider value={context}>
      <AffiliationSync />
      {children}
    </EditPanelContext.Provider>
  );
}

const renderNote = (organization = 'ASCA') =>
  renderWith(<AssignedJudgeNote judgeId="judge-1" />, organization);

describe('Edit show judge affiliation field (MYK9-2294)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listener = undefined;
    mocks.getByShowId.mockResolvedValue([row()]);
    mocks.hasUnsyncedLocalWork.mockResolvedValue(false);
    mocks.setJudgeAffiliation.mockResolvedValue(undefined);
    mocks.fetchJudges.mockResolvedValue([{ id: 'judge-1', judgeAffiliation: 'Region 3' }]);
    mocks.subscribe.mockImplementation((callback: () => void) => {
      mocks.listener = callback;
      return () => {};
    });
  });

  it('saves a typed affiliation through the RPC for the judge on this show', async () => {
    const user = userEvent.setup();
    renderNote();
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    await waitFor(() => expect(input).toHaveValue('Region 3'));
    await user.clear(input);
    await user.type(input, 'ASCA-approved judge, Region 4');
    await user.click(screen.getByRole('button', { name: 'Save affiliation' }));
    await waitFor(() =>
      expect(mocks.setJudgeAffiliation).toHaveBeenCalledWith(
        'judge-1',
        'show-1',
        'ASCA-approved judge, Region 4'
      )
    );
  });

  it('keeps the saved value on screen even when the judge list refetch never lands', async () => {
    const user = userEvent.setup();
    renderNote();
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toHaveValue('Region 3'));
    await waitFor(() => expect(input).toBeEnabled());
    mocks.fetchJudges.mockReturnValue(new Promise(() => {}));
    await user.clear(input);
    await user.type(input, '  Region 9  ');
    await user.click(screen.getByRole('button', { name: 'Save affiliation' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Affiliation saved'));
    expect(input).toHaveValue('Region 9');
  });

  it('keeps the draft and reports the refusal when the save fails (offline)', async () => {
    const user = userEvent.setup();
    mocks.setJudgeAffiliation.mockRejectedValue(
      Object.assign(
        new Error('Reconnect to save changes. Edits to a person save only while online.'),
        {
          code: 'PERSON_EDIT_NEEDS_CONNECTION',
        }
      )
    );
    renderNote();
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, ' x');
    await user.click(screen.getByRole('button', { name: 'Save affiliation' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(input).toHaveValue('Region 3 x');
    expect(input).toBeEnabled();
  });

  it('shows no field on a show that is not ASCA', async () => {
    renderNote('AKC');
    expect(await screen.findByText('Assigned to show')).toBeInTheDocument();
    expect(screen.queryByLabelText('Affiliation')).not.toBeInTheDocument();
  });

  it('offers the field for a judge in the no-longer-qualified list too', async () => {
    renderWith(<JudgeAffiliation judgeId="judge-1" />);
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
  });

  it.each([
    ['a local-only row', [row({ _localOnly: true })], false],
    ['a row with a pending mutation', [row()], true],
    ['no row yet (ticked, not saved)', [], false],
  ])('is disabled with "Saving the judge first" for %s', async (_label, rows, unsynced) => {
    mocks.getByShowId.mockResolvedValue(rows);
    mocks.hasUnsyncedLocalWork.mockResolvedValue(unsynced);
    renderNote();
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save affiliation' })).toBeDisabled();
  });

  it('is ready when one live assignment is on the server, even if another is pending', async () => {
    mocks.getByShowId.mockResolvedValue([
      row({ id: 'ja-show', _syncStatus: 'synced' }),
      row({ id: 'ja-class', _syncStatus: 'pending' }),
    ]);
    mocks.hasUnsyncedLocalWork.mockImplementation(async (id: string) => id === 'ja-class');
    renderNote();
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
  });

  it.each(['declined', 'cancelled'])(
    'shows no field when the only assignment is %s, instead of waiting forever',
    async status => {
      mocks.getByShowId.mockResolvedValue([row({ status })]);
      renderNote();
      expect(await screen.findByText('Assigned to show')).toBeInTheDocument();
      await waitFor(() => expect(mocks.getByShowId).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByLabelText('Affiliation')).not.toBeInTheDocument());
      expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
    }
  );

  it('reads readiness once per show and listens once, however many judges are listed', async () => {
    mocks.getByShowId.mockResolvedValue([row(), row({ id: 'ja-2', personId: 'judge-2' })]);
    renderWith(
      <>
        <AssignedJudgeNote judgeId="judge-1" />
        <AssignedJudgeNote judgeId="judge-2" />
      </>
    );
    await waitFor(() => expect(screen.getAllByLabelText('Affiliation')).toHaveLength(2));
    await waitFor(() =>
      screen.getAllByLabelText('Affiliation').forEach(input => expect(input).toBeEnabled())
    );
    expect(mocks.getByShowId).toHaveBeenCalledTimes(1);
    expect(mocks.getByShowId).toHaveBeenCalledWith('show-1');
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });

  it('stays disabled after reopening Edit show while the upload is unacknowledged', async () => {
    mocks.getByShowId.mockResolvedValue([row({ _syncStatus: 'pending' })]);
    const first = renderNote();
    await screen.findByText('Saving the judge first');
    first.unmount();
    renderNote();
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
  });

  it('enables once the upload is acknowledged, then saves', async () => {
    const user = userEvent.setup();
    mocks.getByShowId.mockResolvedValue([row({ _localOnly: true })]);
    renderNote();
    await screen.findByText('Saving the judge first');
    mocks.getByShowId.mockResolvedValue([row({ _syncStatus: 'synced' })]);
    await act(async () => mocks.listener?.());
    const input = screen.getByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
    await user.type(input, '!');
    await user.click(screen.getByRole('button', { name: 'Save affiliation' }));
    await waitFor(() =>
      expect(mocks.setJudgeAffiliation).toHaveBeenCalledWith('judge-1', 'show-1', 'Region 3!')
    );
  });
});
