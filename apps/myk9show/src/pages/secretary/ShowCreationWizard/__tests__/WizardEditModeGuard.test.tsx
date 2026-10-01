/**
 * MYK9-899: the retired Add Classes panel guarded the class selection against route changes;
 * the wizard's add-classes mode must too. Dirty = selections that are not stored classes.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedChangesRouteGuardProvider } from '@/components/navigation/UnsavedChangesRouteGuard';
import { WizardEditModeGuard } from '../WizardEditModeGuard';
import { countUnsavedClassSelections } from '../classConfigurationValidation';
import { getEditModeReturnPath } from '../showSaveCompletion';
import type { WizardTrial } from '../showCreationWizardTransformers';

const cls = (element: string, level: string) => ({
  templateId: 't1',
  customizations: { className: `${element} ${level}`, element, level, section: 'A' },
});

const trial = (classes: ReturnType<typeof cls>[]): WizardTrial =>
  ({ id: 'trial-1', dateTime: '', eventNumber: '', trialType: 'scent_work', classes }) as never;

const stored = [{ trialId: 'trial-1', element: 'Container', level: 'Novice', section: 'A' }];

describe('countUnsavedClassSelections', () => {
  it('is zero for a freshly loaded draft (only stored classes)', () => {
    expect(countUnsavedClassSelections([trial([cls('Container', 'Novice')])], stored)).toBe(0);
  });

  it('counts a selection that is not stored', () => {
    expect(
      countUnsavedClassSelections(
        [trial([cls('Container', 'Novice'), cls('Interior', 'Novice')])],
        stored
      )
    ).toBe(1);
  });
});

function renderGuard(trials: WizardTrial[]) {
  const router = createMemoryRouter(
    [
      {
        path: '/wizard',
        element: (
          <UnsavedChangesRouteGuardProvider>
            <WizardEditModeGuard
              editMode={{ showId: 's1', mode: 'add-classes' }}
              isDirty
              trials={trials}
              persistedClasses={stored}
              selfNavigationRef={{ current: 0 }}
            />
            <Link to="/elsewhere">Leave</Link>
          </UnsavedChangesRouteGuardProvider>
        ),
      },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ],
    { initialEntries: ['/wizard'] }
  );
  return render(<RouterProvider router={router} />);
}

describe('WizardEditModeGuard in add-classes mode', () => {
  it('prompts when classes are selected but not saved', async () => {
    renderGuard([trial([cls('Container', 'Novice'), cls('Interior', 'Novice')])]);
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByText('Leave the classes you selected?')).toBeInTheDocument();
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
  });

  it('does not prompt when nothing new is selected, even if the store flag is dirty', async () => {
    renderGuard([trial([cls('Container', 'Novice')])]);
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });
});

describe('getEditModeReturnPath', () => {
  it('returns to the resolved launching trial', () => {
    expect(getEditModeReturnPath('s1', 't9')).toBe('/shows/s1/trials/t9');
  });

  it('returns to the show without a resolved trial', () => {
    expect(getEditModeReturnPath('s1', null)).toBe('/shows/s1');
  });
});
