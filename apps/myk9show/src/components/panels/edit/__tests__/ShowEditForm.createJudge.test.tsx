import React, { useEffect, useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The REAL Tabs component is used on purpose: inactive panels unmount, which is
// the lifetime this suite exists to pin (MYK9-908). Do not mock it.

type Judge = {
  id: string;
  firstName: string;
  lastName: string;
  judgeQualifications: { organization: string; status: string }[];
};

const harness = vi.hoisted(() => ({
  canWrite: true,
  createJudge: vi.fn(),
  judges: [] as unknown[],
  judgesLoaded: true,
}));

vi.mock('@/components/shows/wizard/steps/useShowDetailsStepActions', () => ({
  useShowDetailsStepActions: () => ({ handleCreateNewJudge: harness.createJudge }),
}));
vi.mock('@/features/judges/canWriteJudgeQualifications', () => ({
  useCanWriteJudgeQualifications: () => harness.canWrite,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => false }),
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
  useJudgesWithQualifications: () => ({ data: harness.judges, isSuccess: harness.judgesLoaded }),
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

const saveSpy = vi.fn();
const orgControl = { set: (_org: string) => undefined as void };

/** Holds the form state like useFormValidation does: setValue takes a value or an updater. */
const PanelHarness: React.FC<{ organization: string; client: QueryClient }> = ({
  organization: initialOrganization,
  client,
}) => {
  const [organization, setOrganization] = useState(initialOrganization);
  useEffect(() => {
    orgControl.set = setOrganization;
  }, []);
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
          <ShowEditForm activeTab="judges" onTabChange={() => {}} />
          {/* Stands in for the panel footer's Save, which sits outside ShowEditForm. */}
          <button type="button" onClick={saveSpy}>
            Save Changes
          </button>
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

describe('unlisted assigned judges', () => {
  beforeEach(() => {
    roster.current = [];
    harness.judges = [];
    harness.judgesLoaded = true;
  });

  afterEach(() => {
    roster.current = [];
    harness.judges = [];
    harness.judgesLoaded = true;
  });

  it('gives a class-only judge no removal checkbox, and says to change the class', () => {
    roster.current = [
      { judgeId: 'class-only', judgeName: 'Casey Class', hasShowLevelAssignment: false } as never,
    ];
    renderPanel('AKC');
    expect(screen.getByText('Casey Class')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /casey class/i })).not.toBeInTheDocument();
    expect(screen.getByText(/still assigned to a class/i)).toBeInTheDocument();
  });

  it('keeps a pending show-level judge removable after the organization changes', async () => {
    harness.judges = [OLIVE];
    renderPanel('AKC');
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /olive other/i }));
    act(() => orgControl.set('UKC'));
    expect(await screen.findByRole('checkbox', { name: /olive other/i })).toBeChecked();
    expect(screen.queryByText(/still assigned to a class/i)).not.toBeInTheDocument();
  });

  it('gives a judge with show-level and class rows no checkbox either', () => {
    roster.current = [
      {
        judgeId: 'mixed',
        judgeName: 'Morgan Mixed',
        hasShowLevelAssignment: true,
        assignedClasses: ['class-1'],
      } as never,
    ];
    renderPanel('AKC');
    expect(screen.queryByRole('checkbox', { name: /morgan mixed/i })).not.toBeInTheDocument();
  });

  it('keeps a removal checkbox for a show-level judge', () => {
    roster.current = [
      { judgeId: 'show-level', judgeName: 'Sam Show', hasShowLevelAssignment: true } as never,
    ];
    renderPanel('AKC');
    expect(screen.getByRole('checkbox', { name: /sam show/i })).toBeChecked();
  });

  it('flags no one while the qualification read is still loading', () => {
    harness.judgesLoaded = false;
    roster.current = [
      { judgeId: 'show-level', judgeName: 'Sam Show', hasShowLevelAssignment: true } as never,
    ];
    renderPanel('AKC');
    expect(screen.queryByText(/not qualified for AKC shows/i)).not.toBeInTheDocument();
  });
});

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

describe('ShowEditForm Judges tab: modal inline judge create (MYK9-908)', () => {
  beforeEach(() => {
    harness.createJudge.mockReset();
    harness.canWrite = true;
    harness.judges = [OLIVE];
    roster.current = [];
    setValueSpy.mockReset();
    saveSpy.mockReset();
  });

  async function startPendingCreate() {
    const create = deferredCreate();
    const user = userEvent.setup();
    const view = renderPanel();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));
    return { create, user, ...view };
  }

  it('cannot be dismissed by Escape, overlay, X or Cancel while the create is pending', async () => {
    const { user } = await startPendingCreate();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const overlay = document.querySelector('[data-open][class*="bg-black"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jane');
  });

  it('makes the rest of the panel inert while pending: tabs and Save are unreachable', async () => {
    await startPendingCreate();

    expect(screen.queryByRole('tab', { name: /fees/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
    // jsdom does no hit-testing, so assert what blocks a real pointer or Tab: the
    // content outside the modal is hidden from the accessibility tree and inert.
    const save = screen.getByText('Save Changes');
    expect(save.closest('[inert],[aria-hidden="true"]')).not.toBeNull();
  });

  it('assigns, invalidates and closes the dialog on success', async () => {
    const { create, invalidate } = await startPendingCreate();
    await create.resolve('new-judge-id');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(roster.current).toEqual([
      expect.objectContaining({ judgeId: 'new-judge-id', judgeName: 'Jane Doe' }),
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['judges', 'withQualifications'] });
    expect(screen.getByRole('checkbox', { name: /jane doe/i })).toBeChecked();
    expect(screen.getByRole('tab', { name: /fees/i })).toBeInTheDocument();
  });

  it('creates under the current organization and sends exactly what was typed', async () => {
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
  });

  it('skips the assignment with a message if the show organization changed under the create', async () => {
    const { create } = await startPendingCreate();
    act(() => orgControl.set('UKC'));
    await create.resolve('new-judge-id');

    expect(await screen.findByText(/show's organization changed/i)).toBeInTheDocument();
    expect(setValueSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  it('blocks a double submit', async () => {
    const { user } = await startPendingCreate();
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    expect(harness.createJudge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Add Judge' })).toBeDisabled();
  });

  it('keeps the dialog open with what was typed after a failed create, then allows closing', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

  it('offers no inline create to a club admin who cannot write judge qualifications', () => {
    harness.canWrite = false;
    renderPanel('AKC');
    expect(screen.queryByRole('button', { name: /add a new judge/i })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /olive other/i })).toBeInTheDocument();
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
