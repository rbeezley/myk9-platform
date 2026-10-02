/**
 * MYK9-899: Add Classes launched from a trial opens the wizard's class step on THAT trial.
 * An id that is not one of the show's trials falls back to the first trial (old behavior).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const mockUseWizardStore = vi.hoisted(() => vi.fn());

vi.mock('@/store/wizardStore', () => ({ useWizardStore: mockUseWizardStore }));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: vi.fn(() => ({
    templates: [
      {
        id: 'tmpl-akc',
        organization: 'AKC',
        trialType: 'Scent Work',
        templateName: 'AKC Scent Work',
        isActive: true,
        classDefinitions: [
          {
            className: 'AKC Container Novice A',
            element: 'Container',
            level: 'Novice',
            section: 'A',
            displayOrder: 1,
          },
        ],
      },
    ],
    isLoading: false,
    isInitialized: true,
  })),
}));

import { ClassSelectionStep } from '../ClassSelectionStep';

const trial = (id: string, name: string) => ({
  id,
  nameOverride: name,
  trialDate: '',
  eventNumber: '',
  trialType: 'Scent Work',
  classes: [],
});

function wizardState(): Record<string, unknown> {
  return {
    trials: [trial('trial-1', 'Saturday Trial'), trial('trial-2', 'Sunday Trial')],
    updateTrial: vi.fn(),
    show: {
      name: 'Test Show',
      organization: 'AKC',
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds: [],
    },
    judgeDetails: {},
    judgeAssignments: {},
    assignJudgeToClass: vi.fn(),
    setCurrentStep: vi.fn(),
  };
}

const view = () =>
  createWizardTrialView(
    [
      { id: 'trial-1', nameOverride: 'Saturday Trial', trialDate: '' },
      { id: 'trial-2', nameOverride: 'Sunday Trial', trialDate: '' },
    ],
    []
  );

const selectedTab = () => screen.getByRole('tab', { selected: true });
const mockWizardState = () =>
  mockUseWizardStore.mockImplementation((sel: (s: unknown) => unknown) => sel(wizardState()));

describe('ClassSelectionStep trial focus', () => {
  it('opens on the launching trial', () => {
    mockWizardState();
    render(<ClassSelectionStep trialView={view()} focusTrialId="trial-2" />);
    expect(selectedTab()).toHaveTextContent('Sunday Trial');
  });

  it('falls back to the first trial for an unknown id', () => {
    mockWizardState();
    render(<ClassSelectionStep trialView={view()} focusTrialId="trial-gone" />);
    expect(selectedTab()).toHaveTextContent('Saturday Trial');
  });

  it('opens on the first trial when no focus is given', () => {
    mockWizardState();
    render(<ClassSelectionStep trialView={view()} />);
    expect(selectedTab()).toHaveTextContent('Saturday Trial');
  });

  it('lets the user switch away from the focused trial', async () => {
    mockWizardState();
    render(<ClassSelectionStep trialView={view()} focusTrialId="trial-2" />);
    await userEvent.click(screen.getByRole('tab', { name: /Saturday Trial/ }));
    expect(selectedTab()).toHaveTextContent('Saturday Trial');
  });
});
