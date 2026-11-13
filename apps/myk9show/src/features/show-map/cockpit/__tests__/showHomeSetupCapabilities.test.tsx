import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: 'Trial 1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 4,
      scoredCount: 0,
      actions: [],
      attention: [],
      paperwork: [],
      entryRows: [],
    },
  ],
};

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

/**
 * MYK9-956: every Setup → Trials and Setup → Classes action has a home on the
 * show home before Phase 4 deletes Setup.
 *
 * | Setup action                         | On the home                                   |
 * | ------------------------------------ | --------------------------------------------- |
 * | Trials: Add Trial                    | Actions menu "Add Trial"                      |
 * | Trials: row Edit / Delete            | Trial heading menu (Edit); edit panel footer (Delete) |
 * | Trials: row opens the trial page     | The home itself; Entry Forms and Reports tabs (MYK9-1727) |
 * | Classes: Add Classes                 | Trial heading menu "Add classes" (MYK9-1727) |
 * | Classes: row Edit / Delete           | Class Actions menu "Edit class"; edit panel footer (Delete) |
 * | Classes: status change               | Class header Status field (MYK9-1867)        |
 * | Classes: judge, waitlist, bulk bar   | Actions menu "Select classes" (in place)      |
 * | Classes: row opens class details     | Class Actions menu "View entries and results" |
 */
describe('show home carries every Setup action (MYK9-956)', () => {
  function renderCockpit(canManageShow: boolean) {
    return render(
      <SecretaryCockpit snapshot={snapshot} canManageShow={canManageShow} onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
  }

  // Delete lives only in the edit panels' footers on the show home (owner, 2026-10-03).
  // MYK9-1727: the heading holds only the menu; Add classes and (AKC) High in Trial are in it.
  // Judge supplies left this menu for the Show Desk tool (owner, 2026-11-06, MYK9-1728).
  it('gives each trial heading one menu with Add classes and High in Trial, no Delete or Judge supplies', async () => {
    const { user } = renderCockpit(true);

    expect(screen.queryByRole('link', { name: /add classes to trial 1/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /trial actions for trial 1/i }));
    await screen.findByRole('menuitem', { name: 'Edit Trial' });
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Edit Trial',
      'Add classes',
      'High in Trial',
      'Trial report',
    ]);
  });

  it('leaves High in Trial off a UKC show, whose award rules differ', async () => {
    const { user } = render(
      <SecretaryCockpit
        snapshot={{ ...snapshot, registryId: 'UKC' }}
        canManageShow
        onCommand={vi.fn()}
      />,
      { initialRoute: '/shows/show-1' }
    );
    await user.click(screen.getByRole('button', { name: /trial actions for trial 1/i }));
    await screen.findByRole('menuitem', { name: 'Edit Trial' });
    expect(screen.queryByRole('menuitem', { name: 'High in Trial' })).toBeNull();
    // UKC files its own end-of-trial report.
    expect(screen.getByRole('menuitem', { name: 'Trial report' })).toBeInTheDocument();
  });

  // MYK9-1320: the trial's own page is gone for managers, so the heading menu holds its trial-level
  // work. Entry Forms and Reports are the tabs above (MYK9-1727), not menu items.
  describe('trial heading menu doors (MYK9-1320)', () => {
    function renderWithPath() {
      return render(
        <>
          <Routes>
            <Route
              path="/shows/:id"
              element={<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />}
            />
            <Route path="*" element={null} />
          </Routes>
          <Where />
        </>,
        { initialRoute: '/shows/show-1' }
      );
    }
    async function pick(user: Awaited<ReturnType<typeof renderWithPath>>['user'], name: string) {
      await user.click(screen.getByRole('button', { name: /trial actions for trial 1/i }));
      await user.click(await screen.findByRole('menuitem', { name }));
    }

    it('Add classes opens the add-classes page for the trial', async () => {
      const { user } = renderWithPath();
      await pick(user, 'Add classes');
      expect(screen.getByTestId('where')).toHaveTextContent(getAddClassesHref('show-1', 'trial-1'));
    });

    it('High in Trial opens the HIT report scoped to the trial', async () => {
      const { user } = renderWithPath();
      await pick(user, 'High in Trial');
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/shows/show-1/reports?report=high-in-trial&trialId=trial-1'
      );
    });

    it("Trial report opens the registry's end-of-trial report scoped to the trial", async () => {
      const { user } = renderWithPath();
      await pick(user, 'Trial report');
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/shows/show-1/reports?report=trial-secretary-report&trialId=trial-1'
      );
    });
  });

  it('gives the class Actions menu Edit class, with Delete left to the edit panel', async () => {
    const { user } = renderCockpit(true);

    await user.click(screen.getByRole('button', { name: 'Actions for Container Novice' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit class' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.queryByRole('button', { name: /delete class/i })).toBeNull();
  });

  it('offers none of them to a viewer who cannot manage the show', () => {
    renderCockpit(false);

    expect(screen.queryByRole('link', { name: /add classes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /trial actions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit class/i })).toBeNull();
  });
});
