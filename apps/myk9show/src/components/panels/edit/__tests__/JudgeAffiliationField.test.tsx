import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { AssignedJudgeNote } from '../JudgeAffiliationField';

const mocks = vi.hoisted(() => ({
  getAllOrThrow: vi.fn(),
  hasUnsyncedLocalWork: vi.fn(),
  subscribe: vi.fn(),
  setJudgeAffiliation: vi.fn(),
  listener: undefined as undefined | (() => void),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getAllOrThrow: mocks.getAllOrThrow,
    hasUnsyncedLocalWork: mocks.hasUnsyncedLocalWork,
    subscribe: mocks.subscribe,
  },
}));
vi.mock('@/services/database/judges/setJudgeAffiliation', () => ({
  setJudgeAffiliation: mocks.setJudgeAffiliation,
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({
    data: [{ id: 'judge-1', judgeAffiliation: 'Region 3' }],
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ja-1',
  personId: 'judge-1',
  showId: 'show-1',
  status: 'invited',
  ...over,
});

function renderNote(organization = 'ASCA') {
  const context = {
    data: { id: 'show-1', organization },
  } as unknown as EditPanelContextValue;
  return render(
    <EditPanelContext.Provider value={context}>
      <AssignedJudgeNote judgeId="judge-1" />
    </EditPanelContext.Provider>
  );
}

describe('Edit show judge affiliation field (MYK9-2294)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listener = undefined;
    mocks.getAllOrThrow.mockResolvedValue([row()]);
    mocks.hasUnsyncedLocalWork.mockResolvedValue(false);
    mocks.setJudgeAffiliation.mockResolvedValue(undefined);
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
    expect(input).toHaveValue('Region 3');
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

  it('shows no field on a show that is not ASCA', async () => {
    renderNote('AKC');
    expect(await screen.findByText('Assigned to show')).toBeInTheDocument();
    expect(screen.queryByLabelText('Affiliation')).not.toBeInTheDocument();
  });

  it.each([
    ['a local-only row', [row({ _localOnly: true })], false],
    ['a row with a pending mutation', [row()], true],
    ['no row yet (ticked, not saved)', [], false],
  ])('is disabled with "Saving the judge first" for %s', async (_label, rows, unsynced) => {
    mocks.getAllOrThrow.mockResolvedValue(rows);
    mocks.hasUnsyncedLocalWork.mockResolvedValue(unsynced);
    renderNote();
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save affiliation' })).toBeDisabled();
  });

  it('stays disabled after reopening Edit show while the upload is unacknowledged', async () => {
    mocks.getAllOrThrow.mockResolvedValue([row({ _syncStatus: 'pending' })]);
    const first = renderNote();
    await screen.findByText('Saving the judge first');
    first.unmount();
    renderNote();
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
  });

  it('enables once the upload is acknowledged, then saves', async () => {
    const user = userEvent.setup();
    mocks.getAllOrThrow.mockResolvedValue([row({ _localOnly: true })]);
    renderNote();
    await screen.findByText('Saving the judge first');
    mocks.getAllOrThrow.mockResolvedValue([row({ _syncStatus: 'synced' })]);
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
