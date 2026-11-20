import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { getPostSyncInvalidationKeys } from '@/providers/replicationSyncStatus';
import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import {
  AssignedJudgeNote,
  JUDGE_AFFILIATION_READ_ERROR,
  JudgeAffiliation,
  AffiliationRoster,
} from '../JudgeAffiliationField';

const mocks = vi.hoisted(() => ({
  fetchEditor: vi.fn(),
  setJudgeAffiliation: vi.fn(),
  online: true,
}));

vi.mock('@/services/database/judges/judgeAffiliations', () => ({
  fetchShowJudgeAffiliationEditor: mocks.fetchEditor,
}));
vi.mock('@/services/database/judges/setJudgeAffiliation', () => ({
  setJudgeAffiliation: mocks.setJudgeAffiliation,
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => mocks.online }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ready = (affiliation: string | null = 'Region 3') => ({ status: 'ready', affiliation });

/** The Judges tab as Edit show mounts it: one roster read, then a field per judge row. */
const judgesTab = (children: React.ReactNode, organization = 'ASCA') => (
  <EditPanelContext.Provider
    value={{ data: { id: 'show-1', organization } } as unknown as EditPanelContextValue}
  >
    <AffiliationRoster />
    {children}
  </EditPanelContext.Provider>
);

function renderWith(children: React.ReactNode, organization = 'ASCA', queryClient?: QueryClient) {
  return render(judgesTab(children, organization), {
    ...(queryClient !== undefined && { queryClient }),
  });
}

const renderNote = (organization = 'ASCA', queryClient?: QueryClient) =>
  renderWith(<AssignedJudgeNote judgeId="judge-1" />, organization, queryClient);

/** What a sync pass that landed a judge_assignments upload invalidates. */
async function landUpload(queryClient: QueryClient) {
  await act(async () => {
    await Promise.all(
      getPostSyncInvalidationKeys(['judge_assignments']).map(queryKey =>
        queryClient.invalidateQueries({ queryKey })
      )
    );
  });
}

describe('Edit show judge affiliation field (MYK9-2294)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online = true;
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready() });
    mocks.setJudgeAffiliation.mockResolvedValue(undefined);
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

  it('keeps the saved value on screen even when the refetch never lands', async () => {
    const user = userEvent.setup();
    renderNote();
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    mocks.fetchEditor.mockReturnValue(new Promise(() => {}));
    await user.clear(input);
    await user.type(input, '  Region 9  ');
    await user.click(screen.getByRole('button', { name: 'Save affiliation' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Affiliation saved'));
    expect(input).toHaveValue('Region 9');
  });

  it('keeps the draft and reports the refusal when a save fails', async () => {
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
  });

  it('is disabled with a reconnect message while offline', async () => {
    mocks.online = false;
    renderNote();
    expect(await screen.findByText('Reconnect to add the affiliation')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
  });

  it('shows no field on a show that is not ASCA', async () => {
    renderNote('AKC');
    expect(await screen.findByText('Assigned to show')).toBeInTheDocument();
    expect(screen.queryByLabelText('Affiliation')).not.toBeInTheDocument();
  });

  it('shows a no-longer-qualified judge their stored value, read through the assignment', async () => {
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready('Region 7') });
    renderWith(<JudgeAffiliation judgeId="judge-1" />);
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toHaveValue('Region 7'));
    expect(input).toBeEnabled();
  });

  it('is disabled with "Saving the judge first" while the server has no assignment yet', async () => {
    mocks.fetchEditor.mockResolvedValue({});
    renderNote();
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save affiliation' })).toBeDisabled();
  });

  it('shows no field when every assignment is declined or cancelled', async () => {
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': { status: 'inactive', affiliation: null } });
    renderNote();
    expect(await screen.findByText('Assigned to show')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchEditor).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Affiliation')).not.toBeInTheDocument());
    expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
  });

  it('disables a ready field when a refresh fails', async () => {
    const queryClient = createTestQueryClient();
    renderNote('ASCA', queryClient);
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    mocks.fetchEditor.mockRejectedValue(new Error('read failed'));
    await landUpload(queryClient);
    await waitFor(() => expect(input).toBeDisabled());
    expect(screen.getByText(JUDGE_AFFILIATION_READ_ERROR)).toBeInTheDocument();
    expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
  });

  it('says the read failed, with Try again, instead of "Saving the judge first" (MYK9-2297)', async () => {
    const user = userEvent.setup();
    mocks.fetchEditor.mockRejectedValue(new Error('read failed'));
    renderNote('ASCA', createTestQueryClient());
    expect(await screen.findByText(JUDGE_AFFILIATION_READ_ERROR)).toBeInTheDocument();
    expect(screen.queryByText('Saving the judge first')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready() });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText('Affiliation')).toBeEnabled());
    expect(screen.queryByText(JUDGE_AFFILIATION_READ_ERROR)).not.toBeInTheDocument();
  });

  it('keeps a typed draft through a failed read and its Try again (MYK9-2297)', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    renderNote('ASCA', queryClient);
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
    await user.clear(input);
    await user.type(input, 'Region 8');
    mocks.fetchEditor.mockRejectedValue(new Error('read failed'));
    await landUpload(queryClient);
    expect(await screen.findByText(JUDGE_AFFILIATION_READ_ERROR)).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveValue('Region 8');
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready() });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('Region 8');
    expect(screen.getByRole('button', { name: 'Save affiliation' })).toBeEnabled();
  });

  it('reads once when the Judges tab opens, not again per judge ticked (MYK9-2297)', async () => {
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready(), 'judge-2': ready('Region 5') });
    const tab = renderWith(
      <AssignedJudgeNote judgeId="judge-1" />,
      'ASCA',
      createTestQueryClient()
    );
    await waitFor(() => expect(screen.getByLabelText('Affiliation')).toBeEnabled());
    tab.rerender(
      judgesTab(
        <>
          <AssignedJudgeNote judgeId="judge-1" />
          <AssignedJudgeNote judgeId="judge-2" />
        </>
      )
    );
    await waitFor(() =>
      screen.getAllByLabelText('Affiliation').forEach(input => expect(input).toBeEnabled())
    );
    expect(screen.getAllByLabelText('Affiliation')[1]).toHaveValue('Region 5');
    expect(mocks.fetchEditor).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEditor).toHaveBeenCalledWith('show-1');
  });

  it('re-reads on reopening Edit show, so an upload acknowledged while closed enables it', async () => {
    const queryClient = createTestQueryClient();
    mocks.fetchEditor.mockResolvedValue({});
    const first = renderNote('ASCA', queryClient);
    await screen.findByText('Saving the judge first');
    first.unmount();
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready() });
    renderNote('ASCA', queryClient);
    const input = await screen.findByLabelText('Affiliation');
    await waitFor(() => expect(input).toBeEnabled());
  });

  it('stays disabled after reopening Edit show while the upload is unacknowledged', async () => {
    const queryClient = createTestQueryClient();
    mocks.fetchEditor.mockResolvedValue({});
    const first = renderNote('ASCA', queryClient);
    await screen.findByText('Saving the judge first');
    first.unmount();
    renderNote('ASCA', queryClient);
    expect(await screen.findByText('Saving the judge first')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchEditor).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Affiliation')).toBeDisabled();
  });

  it('enables once a sync pass lands the assignment upload, then saves', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    mocks.fetchEditor.mockResolvedValue({});
    renderNote('ASCA', queryClient);
    await screen.findByText('Saving the judge first');
    mocks.fetchEditor.mockResolvedValue({ 'judge-1': ready() });
    await landUpload(queryClient);
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
