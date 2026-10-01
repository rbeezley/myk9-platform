import React, { useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The REAL Tabs component is used on purpose: inactive panels unmount, which is
// the lifetime this suite exists to pin (MYK9-908). Do not mock it.

type Judge = {
  id: string;
  firstName: string;
  lastName: string;
  judgeQualifications: { organization: string; status: string }[];
};

const harness = vi.hoisted(() => ({
  createJudge: vi.fn(),
  judges: [] as unknown[],
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
  useJudgesWithQualifications: () => ({ data: harness.judges }),
}));
vi.mock('../ShowEditBasicInfoTab', () => ({ ShowEditBasicInfoTab: () => null }));
vi.mock('../ShowEditFeesTab', () => ({ ShowEditFeesTab: () => null }));
vi.mock('../ShowEditPremiumTab', () => ({ ShowEditPremiumTab: () => null }));
vi.mock('../ShowOfficialsEditor', () => ({ ShowOfficialsEditor: () => null }));

import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { ShowEditForm } from '../ShowEditForm';

const OLIVE: Judge = {
  id: 'other-judge',
  firstName: 'Olive',
  lastName: 'Other',
  judgeQualifications: [{ organization: 'AKC', status: 'Active' }],
};

interface Roster {
  current: { judgeId: string; judgeName: string }[];
}
const roster: Roster = { current: [] };
const setValueSpy = vi.fn();

/** Holds the form state like useFormValidation does: setValue takes a value or an updater. */
const PanelHarness: React.FC<{ organization: string; client: QueryClient }> = ({
  organization,
  client,
}) => {
  const [assignedJudges, setAssignedJudges] = useState(roster.current);
  const latest = useRef(assignedJudges);
  const [form] = useState(() => ({
    setValue: (field: string, value: unknown) => {
      setValueSpy(field, value);
      const next =
        typeof value === 'function' ? (value as (prev: unknown) => unknown)(latest.current) : value;
      latest.current = next as typeof latest.current;
      roster.current = latest.current;
      setAssignedJudges(latest.current);
    },
  }));
  const value = {
    data: { id: 'show-1', organization, assignedJudges },
    form,
  } as unknown as EditPanelContextValue;
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EditPanelContext.Provider value={value}>
          <ShowEditForm initialTab="judges" />
        </EditPanelContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

function renderPanel(organization = 'AKC') {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(<PanelHarness organization={organization} client={client} />);
  return { ...view, invalidate };
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /add a new judge/i }));
  await user.type(screen.getByLabelText(/first name/i), 'Jane');
  await user.type(screen.getByLabelText(/last name/i), 'Doe');
  await user.type(screen.getByLabelText(/judge number/i), '98234');
  await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
}

/** A create the test resolves by hand, registering the new judge like the real mutation does. */
function deferredCreate() {
  let resolve: (id: string) => void = () => undefined;
  let reject: (err: Error) => void = () => undefined;
  harness.createJudge.mockReturnValue(
    new Promise<string>((res, rej) => {
      resolve = (id: string) => {
        harness.judges = [
          ...harness.judges,
          {
            id,
            firstName: 'Jane',
            lastName: 'Doe',
            judgeQualifications: [{ organization: 'AKC', status: 'Active' }],
          },
        ];
        res(id);
      };
      reject = rej;
    })
  );
  return { resolve: (id: string) => act(async () => resolve(id)), reject };
}

describe('ShowEditForm Judges tab: panel-owned inline judge create (MYK9-908)', () => {
  beforeEach(() => {
    harness.createJudge.mockReset();
    harness.judges = [OLIVE];
    roster.current = [];
    setValueSpy.mockReset();
  });

  it('assigns and lists the judge when the user switches tabs mid-create and comes back', async () => {
    const create = deferredCreate();
    const user = userEvent.setup();
    const { invalidate } = renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    // Leaving the tab unmounts the form that started the create.
    await user.click(screen.getByRole('tab', { name: /fees/i }));
    expect(screen.queryByRole('button', { name: 'Add Judge' })).toBeNull();

    await create.resolve('new-judge-id');
    await waitFor(() =>
      expect(roster.current).toEqual([
        expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
      ])
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['judges', 'withQualifications'] });

    await user.click(screen.getByRole('tab', { name: /judges/i }));
    expect(screen.getByRole('checkbox', { name: /jane doe/i })).toBeChecked();
    expect(screen.getByRole('button', { name: /add a new judge/i })).toBeEnabled();
  });

  it('shows "Creating judge..." on returning to the tab while the create is still pending', async () => {
    deferredCreate();
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    await user.click(screen.getByRole('tab', { name: /fees/i }));
    await user.click(screen.getByRole('tab', { name: /judges/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/creating judge/i);
    expect(screen.getByRole('button', { name: /add a new judge/i })).toBeDisabled();
  });

  it('shows the failure on returning to the tab when the create failed while away', async () => {
    const create = deferredCreate();
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    await user.click(screen.getByRole('tab', { name: /fees/i }));
    await act(async () => create.reject(new Error('boom')));
    await user.click(screen.getByRole('tab', { name: /judges/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to add the judge/i);
    expect(roster.current).toEqual([]);
  });

  it('assigns nothing when the panel closes while the create is pending', async () => {
    const create = deferredCreate();
    const user = userEvent.setup();
    const { unmount } = renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    unmount();
    await create.resolve('late-id');

    expect(setValueSpy).not.toHaveBeenCalled();
    expect(roster.current).toEqual([]);
  });

  it('keeps a judge toggled while the create is pending', async () => {
    const create = deferredCreate();
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await user.click(screen.getByRole('checkbox', { name: /olive other/i }));
    expect(roster.current).toEqual([expect.objectContaining({ judgeId: 'other-judge' })]);

    await create.resolve('new-judge-id');
    await waitFor(() => expect(roster.current).toHaveLength(2));
    expect(roster.current).toEqual([
      expect.objectContaining({ judgeId: 'other-judge' }),
      expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
    ]);
  });

  it('does not add a judge who is already on the roster', async () => {
    harness.createJudge.mockResolvedValue('dup-id');
    roster.current = [{ judgeId: 'dup-id', judgeName: 'Jane Doe' }];
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await waitFor(() => expect(setValueSpy).toHaveBeenCalled());
    expect(roster.current).toHaveLength(1);
  });

  it('blocks a double submit and disables Cancel while pending', async () => {
    deferredCreate();
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(harness.createJudge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Add Judge' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('keeps the form open with what was typed after a failed create', async () => {
    harness.createJudge.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jane');
    expect(screen.getByLabelText(/email/i)).toHaveValue('jane@example.com');
    expect(screen.getByRole('button', { name: 'Add Judge' })).toBeEnabled();
    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it('closes the form and assigns the judge on success without leaving the panel', async () => {
    harness.createJudge.mockResolvedValue('new-judge-id');
    const user = userEvent.setup();
    renderPanel();
    await fillForm(user);
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
      expect(roster.current).toEqual([
        expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
      ])
    );
    expect(screen.getByRole('button', { name: /add a new judge/i })).toBeInTheDocument();
  });

  it('locks the new judge to the show organization with no organization choice (UKC)', async () => {
    harness.createJudge.mockResolvedValue('ukc-judge-id');
    const user = userEvent.setup();
    renderPanel('UKC');
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
    renderPanel('ASCA');
    expect(screen.queryByRole('button', { name: /add a new judge/i })).toBeNull();
    expect(screen.getByRole('link', { name: /manage judge qualifications/i })).toBeInTheDocument();
  });

  it('renders the form controls at the 44px touch floor', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /add a new judge/i }));

    for (const control of [
      screen.getByRole('button', { name: 'Add Judge' }),
      screen.getByRole('button', { name: 'Cancel' }),
      screen.getByLabelText(/first name/i),
      screen.getByLabelText(/judge number/i),
    ]) {
      expect(control.className).toMatch(/\bh-11\b/);
      expect(control.className).not.toMatch(/\b(h-8|h-9)\b/);
    }
  });
});
