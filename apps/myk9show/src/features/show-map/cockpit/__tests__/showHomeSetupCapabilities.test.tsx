import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { HomeClassSelection } from '@/components/shows/ShowDetails/HomeClassSelection';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { getAddTrialsHref } from '@/pages/secretary/ShowCreationWizard/addTrialsHref';
import { ShowHomeSetupLinks } from '../../ShowHomeSetupLinks';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

vi.mock('@/components/shows/tabs/SetupClassesSection', () => ({
  SetupClassesSection: () => <div data-testid="class-management" />,
}));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
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

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

/**
 * MYK9-956: every Setup → Trials and Setup → Classes action has a home on the
 * show home before Phase 4 deletes Setup.
 *
 * | Setup action                         | On the home                                   |
 * | ------------------------------------ | --------------------------------------------- |
 * | Trials: Add Trial                    | Header "Add Trial"                            |
 * | Trials: row Edit / Delete            | Trial heading menu (useTrialRowActions)       |
 * | Trials: row opens the trial page     | Trial heading menu "Trial details"            |
 * | Classes: Add Classes                 | Trial heading "Add Classes"                   |
 * | Classes: row Edit / Delete           | Class panel "Edit class" / "Delete class"     |
 * | Classes: status change               | Class panel / row status control (unchanged)  |
 * | Classes: judge, waitlist, bulk bar   | "Select classes" (Class Management in place)  |
 * | Classes: row opens class details     | Class panel "View entries and results"        |
 */
describe('show home carries every Setup action (MYK9-956)', () => {
  function renderCockpit(canManageShow: boolean) {
    return render(
      <SecretaryCockpit snapshot={snapshot} canManageShow={canManageShow} onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
  }

  it('gives each trial heading Add Classes and an Edit / Trial details / Delete menu', async () => {
    const { user } = renderCockpit(true);

    expect(screen.getByRole('link', { name: /add classes to trial 1/i })).toHaveAttribute(
      'href',
      getAddClassesHref('show-1', 'trial-1')
    );
    await user.click(screen.getByRole('button', { name: /trial actions for trial 1/i }));
    await screen.findByRole('menuitem', { name: 'Edit Trial' });
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Edit Trial',
      'Trial details',
      'Delete Trial',
    ]);
  });

  it('gives the class panel Edit class and Delete class', () => {
    renderCockpit(true);

    expect(screen.getByRole('button', { name: 'Edit class Container Novice' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete class Container Novice' })).toBeEnabled();
  });

  it('offers none of them to a viewer who cannot manage the show', () => {
    renderCockpit(false);

    expect(screen.queryByRole('link', { name: /add classes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /trial actions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit class/i })).toBeNull();
  });

  it('links the header to Add Trial and to Select classes', () => {
    render(<ShowHomeSetupLinks showId="show-1" />, { initialRoute: '/shows/show-1' });

    expect(screen.getByRole('link', { name: /add trial/i })).toHaveAttribute(
      'href',
      getAddTrialsHref('show-1')
    );
    expect(screen.getByRole('link', { name: /select classes/i })).toHaveAttribute(
      'href',
      '/shows/show-1?select=classes'
    );
  });

  it('mounts Class Management in Select classes, and Done drops the mode and its params', async () => {
    const { user } = render(
      <Routes>
        <Route
          path="/shows/:id"
          element={
            <>
              <HomeClassSelection
                showId="show-1"
                tabs={{ trials: [], classes: [], hasUserEntries: false }}
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { initialRoute: '/shows/show-1?select=classes&trialId=trial-1&view=pending&focus=class-1' }
    );

    expect(screen.getByTestId('class-management')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  function renderSelection(initialRoute: string) {
    return render(
      <Routes>
        <Route
          path="/shows/:id"
          element={
            <>
              <HomeClassSelection
                showId="show-1"
                tabs={{ trials: [], classes: [], hasUserEntries: false }}
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { initialRoute }
    );
  }

  it('Done restores the cockpit day, filter and focus it was opened from (Codex P2)', async () => {
    const back = '/shows/show-1?day=2026-10-10&filter=needs-attention&focus=class-1';
    const { user } = renderSelection(
      `/shows/show-1?select=classes&trialId=trial-1&focus=class-1&returnTo=${encodeURIComponent(back)}`
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?day=2026-10-10&filter=needs-attention&focus=class-1'
    );
  });

  it("Done ignores a returnTo that is not this show's home", async () => {
    const { user } = renderSelection(
      `/shows/show-1?select=classes&returnTo=${encodeURIComponent('/shows/other?day=2026-10-10')}`
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });
});
