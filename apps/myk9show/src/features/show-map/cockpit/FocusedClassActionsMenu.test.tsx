import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { render } from '@/test/utils/testUtils';

import { getCockpitPaperScoringHref, getShowHomeHref } from './cockpitRoutes';
import { FocusedClassActionsMenu } from './FocusedClassActionsMenu';

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

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof FocusedClassActionsMenu>> = {},
  secretaryOnlyReason?: string
) {
  const onPlaceByHand = vi.fn();
  const editClass = { disabled: false, onSelect: vi.fn() };
  const view = render(
    <TrialSecretaryAccessProvider reason={secretaryOnlyReason}>
      <FocusedClassActionsMenu
        showId="show-1"
        classId="class-1"
        className="Container Novice"
        canManageShow
        offerDelay
        delayMinutes={45}
        runOrder={runOrder}
        runOrderEntryCount={8}
        editClass={editClass}
        onPlaceByHand={onPlaceByHand}
        entriesHref={ENTRIES_HREF}
        {...overrides}
      />
    </TrialSecretaryAccessProvider>
  );
  return { ...view, onPlaceByHand, editClass };
}

async function openMenu(user: ReturnType<typeof renderMenu>['user']) {
  await user.click(screen.getByRole('button', { name: 'Actions for Container Novice' }));
  await screen.findByRole('menuitem', { name: 'Edit class' });
}

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
      'Score this class',
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

  it('Score this class links to the paper scoring route the step bar opens, returning to this class', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    const returnTo = getShowHomeHref({
      showId: 'show-1',
      state: { statuses: [], focusedClassId: 'class-1' },
    });
    expect(screen.getByRole('menuitem', { name: 'Score this class' })).toHaveAttribute(
      'href',
      getCockpitPaperScoringHref({ classId: 'class-1', returnTo })
    );
  });

  it('keeps status, expected start and actual start out of the menu: they are inline fields', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    expect(itemNames()).not.toContain('Change class status');
    expect(itemNames()).not.toContain('Set expected start');
    expect(itemNames()).not.toContain('Set actual start');
  });

  it('shows Score this class disabled, with the reason, for a manager who cannot operate the show', async () => {
    const { user } = renderMenu({}, 'Only the trial secretary can score.');
    await openMenu(user);

    const item = screen.getByRole('menuitem', { name: 'Score this class' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveAttribute('href');
  });

  it('drops Announce a delay when the panel offers none (started, on time or early)', async () => {
    const { user } = renderMenu({ offerDelay: false });
    await openMenu(user);

    expect(itemNames()).not.toContain('Announce a delay');
    expect(itemNames()).toContain('Score this class');
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

  it('Edit class and Place by hand call the existing handlers', async () => {
    const { user, editClass, onPlaceByHand } = renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit class' }));
    expect(editClass.onSelect).toHaveBeenCalledTimes(1);

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

  it('Announce a delay opens the delay script on this class', async () => {
    const { user } = renderMenu();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Announce a delay' }));

    const dialog = await screen.findByRole('dialog', { name: 'Announce the delay' });
    expect(within(dialog).getByLabelText('Affected class')).toHaveValue('Container Novice');
    expect(within(dialog).getByLabelText('Delay minutes')).toHaveValue('45');
  });
});
