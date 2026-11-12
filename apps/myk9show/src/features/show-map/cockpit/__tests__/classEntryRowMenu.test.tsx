import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { ABSENT_SCORE } from '@/features/at-show/absentScore';
import { toOptimisticScorePayload } from '@/pages/scoring/types';
import { UserRole } from '@/types/auth-types';
import { render } from '@/test/utils/testUtils';
import type { ClassEntryState, SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { CockpitLifecycle } from '../secretaryCockpitTypes';
import { queueFor } from './queueFixture';

const hasRole = vi.fn<(role: string) => boolean>();
const submitScoreOptimistically = vi.fn();
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' }, hasRole }),
}));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({ submitScoreOptimistically }),
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
});

describe('the per-dog menu (MYK9-1873)', () => {
  it('lists the five owner items for a waiting dog, in order', async () => {
    await openMenu(table(row('waiting')));
    expect(await names()).toEqual([
      'Change class',
      'Edit entry',
      'Mark absent',
      'Open dog details',
      'Open person details',
    ]);
  });

  it('links Edit entry, the dog and the person to their existing surfaces', async () => {
    await openMenu(table(row('waiting')));
    expect(screen.getByRole('menuitem', { name: 'Edit entry' })).toHaveAttribute(
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
      expect(await names()).toContain('Edit entry');
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
      'Edit entry',
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
    expect(await names()).toEqual(['Change class', 'Edit entry', 'Mark absent']);
  });

  it('shows no menu without rowMenu (a viewer who cannot manage the show)', () => {
    render(<ClassEntriesTable entries={[row('waiting')]} className="Novice Interior" />);
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });
});

describe('Mark absent (MYK9-1873)', () => {
  it('confirms first, then submits ABSENT_SCORE for that entry and refreshes', async () => {
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));

    expect(await screen.findByText('Mark #110 Hazel absent?')).toBeInTheDocument();
    expect(
      screen.getByText("This records Absent as the dog's result for this class.")
    ).toBeInTheDocument();
    expect(submitScoreOptimistically).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Mark absent' }));

    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalled());
    expect(submitScoreOptimistically).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'e-110',
        classId: 'class-1',
        armband: 110,
        className: 'Novice Interior',
        scoreData: toOptimisticScorePayload(ABSENT_SCORE),
      })
    );
    expect(toastSuccess).toHaveBeenCalledWith('#110 Hazel marked absent.');
  });

  it('writes nothing when the confirm is cancelled', async () => {
    const { user } = await openMenu(table(row('waiting')));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(submitScoreOptimistically).not.toHaveBeenCalled();
  });

  it('says so, and does not refresh, when the score is not saved', async () => {
    submitScoreOptimistically.mockImplementation(async options =>
      options.onError(new Error('queue full'))
    );
    const onRefreshEntries = vi.fn();
    const { user } = await openMenu(table(row('waiting'), { onRefreshEntries }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark absent' }));
    await user.click(await screen.findByRole('button', { name: 'Mark absent' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not saved: queue full'));
    expect(onRefreshEntries).not.toHaveBeenCalled();
  });
});
