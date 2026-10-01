import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));

const harness = vi.hoisted(() => ({
  createJudge: vi.fn(),
  setValue: vi.fn(),
  // Models useFormValidation.setValue: a value, or an updater over the LATEST roster.
  roster: [] as unknown[],
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
  useJudgesWithQualifications: () => ({
    data: [
      {
        id: 'other-judge',
        firstName: 'Olive',
        lastName: 'Other',
        judgeQualifications: [{ organization: 'AKC', status: 'Active' }],
      },
    ],
  }),
}));
vi.mock('../ShowEditBasicInfoTab', () => ({ ShowEditBasicInfoTab: () => null }));
vi.mock('../ShowEditFeesTab', () => ({ ShowEditFeesTab: () => null }));
vi.mock('../ShowEditPremiumTab', () => ({ ShowEditPremiumTab: () => null }));
vi.mock('../ShowOfficialsEditor', () => ({ ShowOfficialsEditor: () => null }));

import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { ShowEditForm } from '../ShowEditForm';

function renderJudgesTab(organization = 'AKC') {
  const value = {
    data: { id: 'show-1', organization, assignedJudges: [] },
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
    harness.roster = [];
    harness.setValue.mockImplementation((_field: string, value: unknown) => {
      harness.roster =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown[])(harness.roster)
          : (value as unknown[]);
    });
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
      expect(harness.roster).toEqual([
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

  it('fixes the new judge to the show organization and offers no organization choice', async () => {
    harness.createJudge.mockResolvedValue('ukc-judge-id');
    const user = userEvent.setup();
    renderJudgesTab('UKC');

    await user.click(screen.getByRole('button', { name: /add a new judge/i }));
    expect(screen.queryByRole('combobox')).toBeNull();
    await user.type(screen.getByLabelText(/first name/i), 'Jane');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/judge number/i), '1');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await waitFor(() =>
      expect(harness.createJudge).toHaveBeenCalledWith(
        expect.objectContaining({ organization: 'UKC' })
      )
    );
  });

  it('offers no inline create for an organization the judge form does not support', () => {
    renderJudgesTab('ASCA');
    expect(screen.queryByRole('button', { name: /add a new judge/i })).toBeNull();
    expect(screen.getByRole('link', { name: /manage judge qualifications/i })).toBeInTheDocument();
  });

  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /add a new judge/i }));
    await user.type(screen.getByLabelText(/first name/i), 'Jane');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/judge number/i), '98234');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
  }

  it('keeps a judge toggled while the create is pending (reads the latest roster on completion)', async () => {
    let resolveCreate: (id: string) => void = () => undefined;
    harness.createJudge.mockReturnValue(
      new Promise<string>(resolve => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    renderJudgesTab();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await user.click(screen.getByRole('checkbox', { name: /olive other/i }));
    expect(harness.roster).toEqual([expect.objectContaining({ judgeId: 'other-judge' })]);

    resolveCreate('new-judge-id');
    await waitFor(() => expect(harness.roster).toHaveLength(2));
    expect(harness.roster).toEqual([
      expect.objectContaining({ judgeId: 'other-judge' }),
      expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
    ]);
  });

  it('does not add a judge who is already on the roster', async () => {
    harness.createJudge.mockResolvedValue('dup-id');
    harness.roster = [{ judgeId: 'dup-id', judgeName: 'Jane Doe' }];
    const user = userEvent.setup();
    renderJudgesTab();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await waitFor(() => expect(harness.setValue).toHaveBeenCalled());
    expect(harness.roster).toHaveLength(1);
  });

  it('submits once while pending and disables Cancel', async () => {
    harness.createJudge.mockReturnValue(new Promise<string>(() => undefined));
    const user = userEvent.setup();
    renderJudgesTab();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(harness.createJudge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Add Judge' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('keeps what was typed after a failed create', async () => {
    harness.createJudge.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderJudgesTab();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jane');
    expect(screen.getByLabelText(/email/i)).toHaveValue('jane@example.com');
    expect(screen.getByRole('button', { name: 'Add Judge' })).toBeEnabled();
  });

  it('assigns nothing if the panel closes while the create is pending', async () => {
    let resolveCreate: (id: string) => void = () => undefined;
    harness.createJudge.mockReturnValue(
      new Promise<string>(resolve => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    const { unmount } = renderJudgesTab();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    unmount();
    resolveCreate('late-id');
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.roster).toEqual([]);
  });

  it('renders the form controls at the 44px touch floor', async () => {
    const user = userEvent.setup();
    renderJudgesTab();
    await user.click(screen.getByRole('button', { name: /add a new judge/i }));

    for (const control of [
      screen.getByRole('button', { name: 'Add Judge' }),
      screen.getByRole('button', { name: 'Cancel' }),
      screen.getByLabelText(/first name/i),
      screen.getByLabelText(/judge number/i),
    ]) {
      expect(control.className).toMatch(/\bh-11\b/);
      expect(control.className).not.toMatch(/\bh-8\b/);
    }
  });
});
