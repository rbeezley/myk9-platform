import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { ABSENT_SCORE } from '@/features/at-show/absentScore';
import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import { toOptimisticScorePayload } from '@/pages/scoring/types';
import { UserRole } from '@/types/auth-types';
import { render } from '@/test/utils/testUtils';
import type { ClassEntryState, SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { CockpitLifecycle } from '../secretaryCockpitTypes';
import { queueFor } from './queueFixture';

const hasRole = vi.fn<(role: string) => boolean>();
const submitScoreOptimistically = vi.fn();
const {
  toastSuccess,
  toastError,
  getStored,
  transitionToCompleted,
  showUndoToast,
  clearEntryScore,
} = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  getStored: vi.fn(),
  transitionToCompleted: vi.fn(),
  showUndoToast: vi.fn(),
  clearEntryScore: vi.fn(),
}));
const isOnline = vi.hoisted(() => ({ value: true }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' }, hasRole }),
}));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({ submitScoreOptimistically }),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { get: getStored },
}));
vi.mock('@/utils/checkInTransitions', () => ({ transitionToCompleted }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => isOnline.value }));
vi.mock('@/features/at-show/clearEntryScore', () => ({ clearEntryScore }));
vi.mock('@/lib/undoToast', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/undoToast')>()),
  showUndoToast,
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

function row(state: ClassEntryState, overrides: Partial<SecretaryCockpitClassEntry> = {}) {
  return {
    nodeId: 'entry:e-110',
    queue: queueFor('entry:e-110', '110', state),
    entryId: 'e-110',
    checkInValue: 'no-status',
    deskEditable: true,
    lockedReason: null,
    armband: '110',
    dogName: 'Hazel',
    handler: 'Dana Lee',
    dogHref: '/dogs/dog-9',
    handlerHref: '/people/person-4',
    state,
    counted: true,
    notCheckedIn: state === 'waiting',
    place: state === 'waiting' ? 1 : null,
    result: null,
    ...overrides,
  } satisfies SecretaryCockpitClassEntry;
}

const changeClass = {
  id: 'move-up-entry',
  commandId: 'move-up-entry:entry:e-110',
  label: 'Change class',
  why: '',
};

function table(
  entry: SecretaryCockpitClassEntry,
  {
    onRefreshEntries = vi.fn(),
    classLifecycle = 'in-progress',
  }: { onRefreshEntries?: () => void; classLifecycle?: CockpitLifecycle | null } = {}
): ReactElement {
  return (
    <ClassEntriesTable
      entries={[entry]}
      className="Novice Interior"
      onRefreshEntries={onRefreshEntries}
      rowMenu={{
        actions: new Map([[entry.nodeId, [changeClass]]]),
        showId: 'show-1',
        classId: 'class-1',
        classLifecycle,
        onCommand: vi.fn(),
      }}
    />
  );
}

async function openMenu(ui: ReactElement) {
  const view = render(ui);
  await view.user.click(screen.getByRole('button', { name: 'Actions for #110 Hazel' }));
  await screen.findAllByRole('menuitem');
  return view;
}

const names = async () => (await screen.findAllByRole('menuitem')).map(item => item.textContent);

beforeEach(() => {
  hasRole.mockReset().mockReturnValue(true);
  submitScoreOptimistically.mockReset().mockImplementation(async options => options.onSuccess());
  toastSuccess.mockReset();
  toastError.mockReset();
  getStored.mockReset().mockResolvedValue({ entry_status: 'accepted', is_scored: false });
  transitionToCompleted.mockReset();
  showUndoToast.mockReset();
  clearEntryScore.mockReset().mockResolvedValue(undefined);
  isOnline.value = true;
});

describe('the per-dog menu (MYK9-1873)', () => {
  it('lists the five owner items for a waiting dog, in order', async () => {
    await openMenu(table(row('waiting')));
    expect(await names()).toEqual([
      'Change class',
      'Change handler',
      'Mark absent',
      'Open dog details',
      'Open person details',
    ]);
  });

  it('links Change handler, the dog and the person to their existing surfaces', async () => {
    await openMenu(table(row('waiting')));
    expect(screen.getByRole('menuitem', { name: 'Change handler' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?queue=all&entry=e-110'
    );
    expect(screen.getByRole('menuitem', { name: 'Open dog details' })).toHaveAttribute(
      'href',
      '/dogs/dog-9'
    );
    expect(screen.getByRole('menuitem', { name: 'Open person details' })).toHaveAttribute(
      'href',
      '/people/person-4'
    );
  });

  it('offers Mark absent for a dog in the ring', async () => {
    await openMenu(table(row('in-ring')));
    expect(await names()).toContain('Mark absent');
  });

  it.each<ClassEntryState>(['scored', 'pulled', 'withdrawn', 'absent'])(
    'hides Mark absent for a %s dog',
    async state => {
      await openMenu(table(row(state)));
      expect(await names()).not.toContain('Mark absent');
      expect(await names()).toContain('Change handler');
    }
  );

  it.each<CockpitLifecycle | null>(['cancelled', 'complete', null])(
    'hides Mark absent when the class lifecycle is %s',
    async lifecycle => {
      await openMenu(table(row('waiting'), { classLifecycle: lifecycle }));
      expect(await names()).not.toContain('Mark absent');
    }
  );

  it('offers Mark absent before the class has started', async () => {
    await openMenu(table(row('waiting'), { classLifecycle: 'not-started' }));
    expect(await names()).toContain('Mark absent');
  });

  it('hides Mark absent for a viewer who is not the trial secretary', async () => {
    await openMenu(
      <TrialSecretaryAccessProvider reason="Only the trial secretary can do this.">
        {table(row('waiting'))}
      </TrialSecretaryAccessProvider>
    );
    expect(await names()).toEqual([
      'Change class',
      'Change handler',
      'Open dog details',
      'Open person details',
    ]);
  });

  it('omits the person link for a viewer /people/:id would refuse', async () => {
    hasRole.mockImplementation(role => role !== UserRole.SECRETARY && role !== UserRole.SITE_ADMIN);
    await openMenu(table(row('waiting')));
    expect(await names()).not.toContain('Open person details');
    expect(await names()).toContain('Open dog details');
  });

  it('omits the open links when the entry carries no dog or person id', async () => {
    await openMenu(table(row('waiting', { dogHref: undefined, handlerHref: undefined })));
    expect(await names()).toEqual(['Change class', 'Change handler', 'Mark absent']);
  });

  it('shows no menu without rowMenu (a viewer who cannot manage the show)', () => {
    render(<ClassEntriesTable entries={[row('waiting')]} className="Novice Interior" />);
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });
});

describe('Mark absent: one tap, says what happened, Undo (MYK9-1940)', () => {
  it('submits ABSENT_SCORE at once with no confirmation, and refreshes', async () => {
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));

    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalled());
    expect(screen.queryByText('Mark #110 Hazel absent?')).toBeNull();
    expect(submitScoreOptimistically).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'e-110',
        classId: 'class-1',
        armband: 110,
        className: 'Novice Interior',
        scoreData: toOptimisticScorePayload(ABSENT_SCORE),
      })
    );
  });

  it('names the dog and the class, with the shared Undo and duration', async () => {
    const { user } = await openMenu(table(row('waiting')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledTimes(1));
    expect(showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '#110 Hazel marked absent in Novice Interior',
        duration: STATUS_UNDO_WINDOW_MS,
      })
    );
  });

  it('Undo clears the result with the same write as Reset score, then refreshes', async () => {
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled());
    onRefreshEntries.mockClear();

    showUndoToast.mock.calls[0]?.[0].onUndo();

    await waitFor(() => expect(clearEntryScore).toHaveBeenCalledWith('e-110'));
    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalled());
  });

  it('says so when Undo cannot clear the result', async () => {
    clearEntryScore.mockRejectedValue(new Error('offline'));
    const { user } = await openMenu(table(row('waiting')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled());

    showUndoToast.mock.calls[0]?.[0].onUndo();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Could not undo #110 Hazel marked absent in Novice Interior. Try again.'
      )
    );
  });

  it('says so, offers no Undo and does not refresh when the score is not saved', async () => {
    submitScoreOptimistically.mockImplementation(async options =>
      options.onError(new Error('queue full'))
    );
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not saved: queue full'));
    expect(showUndoToast).not.toHaveBeenCalled();
    expect(onRefreshEntries).not.toHaveBeenCalled();
  });
});

describe('Mark absent re-checks the entry (MYK9-1873)', () => {
  it('refuses, writes nothing and says so when the entry was scored since the table read it', async () => {
    getStored.mockResolvedValue({
      entry_status: 'accepted',
      is_scored: true,
      result_status: 'qualified',
    });
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        '#110 Hazel was scored while this was open; nothing was changed.'
      )
    );
    expect(getStored).toHaveBeenCalledWith('e-110');
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
    expect(onRefreshEntries).not.toHaveBeenCalled();
  });

  it('refuses when the entry was pulled since the table read it', async () => {
    getStored.mockResolvedValue({ entry_status: 'accepted', check_in_status: 'pulled' });
    const { user } = await openMenu(table(row('waiting')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
  });

  it('takes a dog that was in the ring out of it once the absent is saved', async () => {
    getStored.mockResolvedValue({ entry_status: 'accepted', check_in_status: 'in-ring' });
    const { user } = await openMenu(table(row('in-ring')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(transitionToCompleted).toHaveBeenCalledWith('e-110'));
  });

  it('leaves the check-in of a dog that was only waiting alone', async () => {
    const { user } = await openMenu(table(row('waiting')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled());
    expect(transitionToCompleted).not.toHaveBeenCalled();
  });
});

describe('offline: Change class and Change handler say why before she taps (MYK9-1940)', () => {
  it('disables both with their reasons', async () => {
    isOnline.value = false;
    await openMenu(table(row('waiting')));
    const changeClass = screen.getByRole('menuitem', { name: /^Change class/ });
    const changeHandler = screen.getByRole('menuitem', { name: /^Change handler/ });
    expect(changeClass).toHaveAttribute('aria-disabled', 'true');
    expect(changeHandler).toHaveAttribute('aria-disabled', 'true');
    expect(changeClass).toHaveTextContent('Changing a class needs a connection.');
    expect(changeHandler).toHaveTextContent('Changing a handler needs a connection.');
    expect(changeHandler).not.toHaveAttribute('href');
  });

  it('leaves Mark absent, which is stored on the device, enabled', async () => {
    isOnline.value = false;
    await openMenu(table(row('waiting')));
    expect(screen.getByRole('menuitem', { name: 'Mark absent' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('runs Change class when online', async () => {
    const onCommand = vi.fn();
    const entry = row('waiting');
    const { user } = await openMenu(
      <ClassEntriesTable
        entries={[entry]}
        className="Novice Interior"
        rowMenu={{
          actions: new Map([[entry.nodeId, [changeClass]]]),
          showId: 'show-1',
          classId: 'class-1',
          classLifecycle: 'in-progress',
          onCommand,
        }}
      />
    );
    await user.click(screen.getByRole('menuitem', { name: 'Change class' }));
    expect(onCommand).toHaveBeenCalledWith('move-up-entry:entry:e-110');
  });
});
