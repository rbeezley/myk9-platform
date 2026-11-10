import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';

import { STATUS_TIMING_HELP } from './ClassOperationalControls';
import { FocusedClassActionsMenu } from './FocusedClassActionsMenu';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
}));
vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

const ENTRIES_HREF = '/shows/show-1/trials/trial-1/classes/class-1?returnTo=%2Fshows%2Fshow-1';

const runOrder = {
  onAutoSort: vi.fn(),
  isAutoSorting: false,
  onPlaceEntry: vi.fn(),
  lastChange: null,
  onUndo: vi.fn(),
};

function renderMenu(overrides: Partial<React.ComponentProps<typeof FocusedClassActionsMenu>> = {}) {
  const onEditActualStart = vi.fn();
  const onPlaceByHand = vi.fn();
  const editClass = { disabled: false, onSelect: vi.fn() };
  const view = render(
    <FocusedClassActionsMenu
      showId="show-1"
      classId="class-1"
      className="Container Novice"
      lifecycle="not-started"
      unenteredScoreCount={0}
      canManageShow
      scheduledStart="9:00 AM"
      revisedExpectedStart={null}
      trialDate="2026-07-20"
      timeZone="America/Chicago"
      offerDelay
      delayMinutes={45}
      runOrder={runOrder}
      runOrderEntryCount={8}
      editClass={editClass}
      onEditActualStart={onEditActualStart}
      onPlaceByHand={onPlaceByHand}
      entriesHref={ENTRIES_HREF}
      {...overrides}
    />
  );
  return { ...view, onEditActualStart, onPlaceByHand, editClass };
}

async function openMenu(user: ReturnType<typeof renderMenu>['user']) {
  await user.click(screen.getByRole('button', { name: 'Actions for Container Novice' }));
  await screen.findByRole('menuitem', { name: 'Edit class' });
}

// A submenu parks pointer-events: none on its parent while open, which user-event would refuse.
const submenuUser = () => userEvent.setup({ pointerEventsCheck: 0 });

const itemNames = () => screen.getAllByRole('menuitem').map(item => item.textContent?.trim());

describe('FocusedClassActionsMenu (MYK9-1796)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every action for a manager of a class that has not started', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    expect(itemNames()).toEqual([
      'Edit class',
      'Change class status',
      'Set expected start',
      'Set actual start',
      'Announce a delay',
      'Auto-sort run order',
      'Place by hand',
      'View entries and results',
    ]);
    expect(screen.getByRole('menuitem', { name: 'View entries and results' })).toHaveAttribute(
      'href',
      ENTRIES_HREF
    );
  });

  it.each<[CockpitLifecycle, string]>([
    ['not-started', 'Not started'],
    ['in-progress', 'In progress'],
    ['complete', 'Complete'],
  ])('shows a %s class as the one status that cannot be picked again', async (lifecycle, label) => {
    const { user } = renderMenu({ lifecycle });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));

    expect(await screen.findByRole('menuitem', { name: label })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Cancelled' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('drops Announce a delay when the panel offers none (started, on time or early)', async () => {
    const { user } = renderMenu({ offerDelay: false });
    await openMenu(user);

    expect(itemNames()).not.toContain('Announce a delay');
    expect(itemNames()).toContain('Set expected start');
  });

  it.each([0, 1])('drops the run-order items for a class with %i entries', async count => {
    const { user } = renderMenu({ runOrderEntryCount: count });
    await openMenu(user);

    expect(itemNames()).not.toContain('Auto-sort run order');
    expect(itemNames()).not.toContain('Place by hand');
  });

  it('gives a viewer who cannot manage the show only a link to the entries and results', () => {
    renderMenu({ canManageShow: false });

    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'View entries and results' })).toHaveAttribute(
      'href',
      ENTRIES_HREF
    );
  });

  it('Edit class, Set actual start and Place by hand call the existing handlers', async () => {
    const { user, editClass, onEditActualStart, onPlaceByHand } = renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit class' }));
    expect(editClass.onSelect).toHaveBeenCalledTimes(1);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Set actual start' }));
    expect(onEditActualStart).toHaveBeenCalledTimes(1);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Place by hand' }));
    expect(onPlaceByHand).toHaveBeenCalledTimes(1);
  });

  it('locks Edit class while another class edit is resolving', async () => {
    const { user } = renderMenu({ editClass: { disabled: true, onSelect: vi.fn() } });
    await openMenu(user);

    expect(screen.getByRole('menuitem', { name: 'Edit class' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('changes status through the shared path, confirming Complete over unentered scores', async () => {
    renderMenu({ lifecycle: 'in-progress', unenteredScoreCount: 2 });
    const user = submenuUser();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('2 paper scores still need entry. Mark this Class complete anyway?')
    ).toBeInTheDocument();
    expect(applyManualClassStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Mark complete' }));
    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.COMPLETED);
  });

  // Pins the menu's wiring of an unknown count; the panel passing null is pinned in
  // SecretaryCockpitFocusedClass.guards.test.tsx, which is the test that fails without the fix.
  it('hands an unknown unentered-score count to the Complete confirmation (MYK9-1801)', async () => {
    renderMenu({ lifecycle: 'in-progress', unenteredScoreCount: null });
    const user = submenuUser();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^Entry data is unavailable/)).toBeInTheDocument();
    expect(applyManualClassStatus).not.toHaveBeenCalled();
  });

  it('does not offer Set actual start on a cancelled class, which has no editor to open (MYK9-1803)', async () => {
    const { user } = renderMenu({ lifecycle: 'cancelled' });
    await openMenu(user);

    expect(screen.queryByRole('menuitem', { name: 'Set actual start' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Set expected start' })).toBeInTheDocument();
  });

  it('explains the timing, and keeps Cancelled apart from the routine statuses, in the status submenu', async () => {
    renderMenu({ lifecycle: 'in-progress' });
    const user = submenuUser();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));

    const cancelled = await screen.findByRole('menuitem', { name: 'Cancelled' });
    expect(screen.getByText(STATUS_TIMING_HELP)).toBeInTheDocument();
    expect(cancelled).toHaveClass('text-destructive');
    const submenu = cancelled.closest('[role="menu"]')!;
    const separator = within(submenu as HTMLElement).getByRole('separator');
    // The separator sits after every routine status and before Cancelled.
    expect(
      separator.compareDocumentPosition(cancelled) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      within(submenu as HTMLElement)
        .getByRole('menuitem', { name: 'Complete' })
        .compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('writes nothing when the Complete confirmation is cancelled', async () => {
    renderMenu({ lifecycle: 'in-progress', unenteredScoreCount: 2 });
    const user = submenuUser();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(applyManualClassStatus).not.toHaveBeenCalled();
  });

  describe('Cancelled (MYK9-1840)', () => {
    async function chooseCancelled() {
      renderMenu({ lifecycle: 'in-progress' });
      const user = submenuUser();
      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Cancelled' }));
      return { user, dialog: await screen.findByRole('alertdialog') };
    }

    it('asks first, naming the class, and applies nothing until confirmed', async () => {
      const { user, dialog } = await chooseCancelled();
      expect(within(dialog).getByText('Cancel this class?')).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'Container Novice will show as cancelled on the show schedule and will stop taking entries. Ringside screens will not show the change. You can change the status back later.'
        )
      ).toBeInTheDocument();
      expect(applyManualClassStatus).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Cancel class' }));
      expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.CANCELLED);
    });

    it('applies nothing when the question is dismissed with Keep class', async () => {
      const { user, dialog } = await chooseCancelled();
      await user.click(within(dialog).getByRole('button', { name: 'Keep class' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(applyManualClassStatus).not.toHaveBeenCalled();
    });
  });

  it('applies a routine status change straight away', async () => {
    renderMenu();
    const user = submenuUser();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Change class status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'In progress' }));

    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.IN_PROGRESS);
  });

  it('Set expected start hosts the existing editor in a dialog and closes it after saving', async () => {
    const { user } = renderMenu({ revisedExpectedStart: '2026-07-20T15:15:00.000Z' });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Set expected start' }));

    const dialog = await screen.findByRole('dialog', { name: 'Set expected start' });
    await user.click(within(dialog).getByRole('button', { name: 'Use scheduled time' }));

    expect(setRevisedExpectedStart).toHaveBeenCalledWith('class-1', null);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Set expected start' })).toBeNull()
    );
  });

  it('Announce a delay opens the delay script on this class', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Announce a delay' }));

    const dialog = await screen.findByRole('dialog', { name: 'Announce the delay' });
    expect(within(dialog).getByLabelText('Affected class')).toHaveValue('Container Novice');
    expect(within(dialog).getByLabelText('Delay minutes')).toHaveValue('45');
  });
});
