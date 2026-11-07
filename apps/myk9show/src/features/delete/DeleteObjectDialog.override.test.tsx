/**
 * MYK9-1596: the site-admin override of a blocked show, trial or class delete.
 * Offered only to a site admin, only when blocked, for one object; armed by the
 * object's name, a reason and (money paid online) the typed dollar amount; the
 * reason goes to the server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { EMPTY_PREVIEW } from './deletePreview';
import type { DeleteObjectKind, DeletePreview, DeleteTarget } from './deleteTypes';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
  refresh: vi.fn(),
  unsaved: vi.fn(),
  roles: [] as string[],
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: (role: string) => mocks.roles.includes(role) }),
}));
vi.mock('./deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('./deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
vi.mock('./deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: mocks.restore,
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: mocks.purge,
  reconcileLocalRestore: mocks.refresh,
}));
vi.mock('./deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('./deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: mocks.unsaved,
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { DeleteObjectDialog } from './DeleteObjectDialog';

const counts = (over: Partial<DeletePreview>): DeletePreview => ({ ...EMPTY_PREVIEW, ...over });

/** 14 paid entries, $420 recorded; 3 of them paid online for $90 and never refunded. */
const PAID_ONLINE = counts({
  entries: 20,
  paid: 14,
  blocking: 14,
  paid_amount: 420,
  stripe_unrefunded: 3,
  stripe_unrefunded_amount: 90,
});
/** All paid by cash or check: the standard warning only. */
const PAID_CASH = counts({ entries: 5, paid: 5, blocking: 5, paid_amount: 150 });

const ctx = { showId: 's1' };
const TARGETS: Record<'show' | 'trial' | 'class', DeleteTarget> = {
  show: { id: 's1', name: 'Heartland Classic', context: ctx },
  trial: { id: 't1', name: 'Saturday Trial', context: ctx },
  class: { id: 'c1', name: 'Interior Novice A', context: ctx },
};

function renderDialog(kind: DeleteObjectKind, target: DeleteTarget) {
  return render(<DeleteObjectDialog open onOpenChange={vi.fn()} kind={kind} targets={[target]} />);
}

async function openDialog() {
  return screen.findByRole('alertdialog');
}

beforeEach(() => {
  for (const fn of [mocks.preview, mocks.remove, mocks.restore, mocks.purge, mocks.refresh]) {
    fn.mockReset();
  }
  mocks.roles = [];
  mocks.remove.mockResolvedValue('deleted');
  mocks.restore.mockResolvedValue(undefined);
  mocks.purge.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.unsaved.mockReset();
  mocks.unsaved.mockResolvedValue({ total: 0, failed: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('who is offered the override', () => {
  for (const kind of ['show', 'trial', 'class'] as const) {
    it(`a site admin sees it on a blocked ${kind}, with the consequence in numbers`, async () => {
      mocks.roles = [UserRole.SITE_ADMIN];
      mocks.preview.mockResolvedValue(PAID_CASH);
      renderDialog(kind, TARGETS[kind]);

      const override = await screen.findByTestId('delete-override');
      expect(within(override).getByTestId('delete-override-consequence')).toHaveTextContent(
        'Deleting anyway removes 5 paid entries, $150.00 recorded. No refund is issued.'
      );
      expect(within(override).getByLabelText(/^Why are you deleting this/)).toBeInTheDocument();
      expect(
        within(override).getByLabelText(`Type the ${kind} name to confirm: ${TARGETS[kind].name}`)
      ).toBeInTheDocument();
    });
  }

  for (const role of [UserRole.SECRETARY, UserRole.CLUB_ADMIN]) {
    it(`a ${role} never sees it on a blocked show`, async () => {
      mocks.roles = [role];
      mocks.preview.mockResolvedValue(PAID_ONLINE);
      renderDialog('show', TARGETS.show);

      const dialog = await openDialog();
      await screen.findByTestId('delete-blocked-reason');
      expect(screen.queryByTestId('delete-override')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeDisabled();
    });
  }

  it('a site admin does not see it when nothing is blocked', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(counts({ entries: 2 }));
    renderDialog('show', TARGETS.show);

    const dialog = await openDialog();
    const del = within(dialog).getByRole('button', { name: 'Delete show' });
    await waitFor(() => expect(del).toBeEnabled());
    expect(screen.queryByTestId('delete-override')).not.toBeInTheDocument();
  });

  it('a site admin does not get it on a blocked entry (Withdraw or Pull is the path)', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(counts({ paid: 1, blocking: 1 }));
    renderDialog('entry', { id: 'e1', name: 'Rex', context: ctx });

    await screen.findByTestId('delete-blocked-reason');
    expect(screen.queryByTestId('delete-override')).not.toBeInTheDocument();
  });
});

describe('arming the override', () => {
  it('stays off until the name AND a reason are typed (paid in cash)', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(PAID_CASH);
    const { user } = renderDialog('trial', TARGETS.trial);

    const dialog = await openDialog();
    const del = within(dialog).getByRole('button', { name: 'Delete trial' });
    await screen.findByTestId('delete-override');
    expect(del).toBeDisabled();
    expect(screen.queryByTestId('delete-override-stripe')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/online payment total/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Type the trial name/), 'Saturday Trial');
    expect(del).toBeDisabled();

    await user.type(screen.getByLabelText(/^Why are you deleting this/), '   ');
    expect(del).toBeDisabled();

    await user.type(screen.getByLabelText(/^Why are you deleting this/), 'Wrong club');
    expect(del).toBeEnabled();

    await user.clear(screen.getByLabelText(/^Type the trial name/));
    await user.type(screen.getByLabelText(/^Type the trial name/), 'Saturday');
    expect(del).toBeDisabled();
  });

  it('with money paid online, also needs the exact dollar amount, and warns', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(PAID_ONLINE);
    const { user } = renderDialog('show', TARGETS.show);

    const dialog = await openDialog();
    const del = within(dialog).getByRole('button', { name: 'Delete show' });
    expect(await screen.findByTestId('delete-override-consequence')).toHaveTextContent(
      '14 paid entries, $420.00 recorded'
    );
    expect(screen.getByTestId('delete-override-stripe')).toHaveTextContent(
      '3 of these entries were paid online, $90.00 in all. That money stays captured in Stripe and myK9 does not refund it.'
    );

    await user.type(screen.getByLabelText(/^Type the show name/), 'heartland classic');
    await user.type(screen.getByLabelText(/^Why are you deleting this/), 'Duplicate show');
    expect(del).toBeDisabled();

    const amount = screen.getByLabelText(/online payment total/);
    await user.type(amount, '420');
    expect(del).toBeDisabled();

    await user.clear(amount);
    await user.type(amount, '$90.00');
    expect(del).toBeEnabled();
  });
});

describe('the delete call', () => {
  it('passes override=true and the trimmed reason through to the server delete', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(PAID_ONLINE);
    const { user } = renderDialog('show', TARGETS.show);

    const dialog = await openDialog();
    await user.type(await screen.findByLabelText(/^Type the show name/), 'Heartland Classic');
    await user.type(screen.getByLabelText(/^Why are you deleting this/), '  Duplicate show  ');
    await user.type(screen.getByLabelText(/online payment total/), '90');
    const del = within(dialog).getByRole('button', { name: 'Delete show' });
    await waitFor(() => expect(del).toBeEnabled());
    await user.click(del);

    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('show', 's1', {
        override: true,
        reason: 'Duplicate show',
      })
    );
  });

  it('sends no override on an ordinary delete by a site admin when nothing is blocked', async () => {
    mocks.roles = [UserRole.SITE_ADMIN];
    mocks.preview.mockResolvedValue(counts({ entries: 1 }));
    const { user } = renderDialog('class', TARGETS.class);

    const dialog = await openDialog();
    const del = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(del).toBeEnabled());
    await user.click(del);

    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('class', 'c1', { override: false })
    );
  });
});
