import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));

const harness = vi.hoisted(() => ({
  createJudge: vi.fn(),
  setValue: vi.fn(),
}));

vi.mock('@/components/shows/wizard/steps/useShowDetailsStepActions', () => ({
  useShowDetailsStepActions: () => ({ handleCreateNewJudge: harness.createJudge }),
}));
vi.mock('@/store/templateStore', () => ({
  useTemplateStore: () => ({ templates: [] }),
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'c1' }], loadClubs: vi.fn() }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [{ id: 'p1' }], loadUsers: vi.fn() }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('../ShowEditBasicInfoTab', () => ({ ShowEditBasicInfoTab: () => null }));
vi.mock('../ShowEditFeesTab', () => ({ ShowEditFeesTab: () => null }));
vi.mock('../ShowEditPremiumTab', () => ({ ShowEditPremiumTab: () => null }));
vi.mock('../ShowOfficialsEditor', () => ({ ShowOfficialsEditor: () => null }));

import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { ShowEditForm } from '../ShowEditForm';

function renderJudgesTab() {
  const value = {
    data: { id: 'show-1', organization: 'AKC', assignedJudges: [] },
    form: { setValue: harness.setValue },
  } as unknown as EditPanelContextValue;
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EditPanelContext.Provider value={value}>
          <ShowEditForm initialTab="judges" />
        </EditPanelContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ShowEditForm Judges tab: create a judge in place (MYK9-903)', () => {
  beforeEach(() => {
    harness.createJudge.mockReset();
    harness.setValue.mockReset();
  });

  it('creates the judge through the wizard mutation and assigns them to the show without leaving the panel', async () => {
    harness.createJudge.mockResolvedValue('new-judge-id');
    const user = userEvent.setup();
    renderJudgesTab();

    await user.click(screen.getByRole('button', { name: /add a new judge/i }));
    await user.type(screen.getByLabelText(/first name/i), 'Jane');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/judge number/i), '98234');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await waitFor(() =>
      expect(harness.createJudge).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        organization: 'AKC',
        judgeNumber: '98234',
        email: 'jane@example.com',
      })
    );
    await waitFor(() =>
      expect(harness.setValue).toHaveBeenCalledWith('assignedJudges', [
        expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
      ])
    );
    // The form closes again and no navigation to /people was needed.
    expect(screen.queryByRole('button', { name: 'Add Judge' })).toBeNull();
    expect(screen.getByRole('button', { name: /add a new judge/i })).toBeInTheDocument();
  });

  it('keeps the form open and assigns nothing when creating the judge fails', async () => {
    harness.createJudge.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderJudgesTab();

    await user.click(screen.getByRole('button', { name: /add a new judge/i }));
    await user.type(screen.getByLabelText(/first name/i), 'Jane');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/judge number/i), '98234');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
    expect(harness.setValue).not.toHaveBeenCalled();
  });
});
