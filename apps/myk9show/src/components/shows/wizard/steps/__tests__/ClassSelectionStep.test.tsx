/**
 * Registry-driven class list test (secretary-verification-remediation, task
 * 6.3). ClassSelectionStep filters `useTemplates()` output to the ones
 * matching `show.organization` (see `activeTemplates` in ClassSelectionStep.tsx)
 * before handing them to SimpleClassSelector. This guards that a UKC or ASCA
 * show only ever sees its OWN registry's class list, not AKC's (or each
 * other's) — the multi-registry layer's whole point.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const mockUpdateTrial = vi.fn();
const mockAssignJudgeToClass = vi.fn();
const mockUseWizardStore = vi.hoisted(() => vi.fn());

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: mockUseWizardStore,
}));

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
      {
        id: 'tmpl-ukc',
        organization: 'UKC',
        trialType: 'Nosework',
        templateName: 'UKC Nosework',
        isActive: true,
        classDefinitions: [
          { className: 'UKC Vehicle Novice', element: 'Vehicle', level: 'Novice', displayOrder: 1 },
        ],
      },
      {
        id: 'tmpl-asca',
        organization: 'ASCA',
        trialType: 'Scent Detection',
        templateName: 'ASCA Scent Detection',
        isActive: true,
        classDefinitions: [
          {
            className: 'ASCA Container Open',
            element: 'Container',
            level: 'Open',
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

function fakeWizardState(organization: string): Record<string, unknown> {
  return {
    trials: [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '',
        eventNumber: '',
        trialType: organization === 'UKC' ? 'Nosework' : 'Scent Detection',
        classes: [],
      },
    ],
    updateTrial: mockUpdateTrial,
    show: {
      name: 'Test Show',
      organization,
      startDate: '',
      endDate: '',
      location: '',
      clubId: '',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      startingArmbandNumber: 100,
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds: [],
      acceptCheckPayments: false,
      acceptCashPayments: false,
    },
    judgeDetails: {},
    judgeAssignments: {},
    assignJudgeToClass: mockAssignJudgeToClass,
  };
}

/**
 * MYK9-389 — a class cloned into the wizard under a custom name. Its
 * element/level/section match the AKC template's own class, so
 * `mergeTemplateWithRetainedClassDefinitions` DISPLACES that definition and the
 * custom class becomes the only Container/Novice/A entry in the catalog. The
 * previous fix keyed only on ambiguity and therefore rendered nothing here.
 */
function wizardStateWithRetainedCustomClass(): Record<string, unknown> {
  const state = fakeWizardState('AKC');
  (state.trials as Record<string, unknown>[])[0]!.classes = [
    {
      templateId: 'tmpl-akc',
      customizations: {
        className: 'AKC Container Novice A Preliminary',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        displayOrder: 1,
        fieldOverrides: {},
      },
    },
  ];
  return state;
}

function setOrganization(organization: string) {
  mockUseWizardStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector(fakeWizardState(organization))
  );
}

describe('ClassSelectionStep — registry-filtered class list', () => {
  it('shows only the UKC Nosework class list for a UKC show', async () => {
    setOrganization('UKC');

    render(<ClassSelectionStep />);

    expect(await screen.findByLabelText(/Select UKC Vehicle Novice/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/AKC Container Novice A/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ASCA Container Open/i)).not.toBeInTheDocument();
  });

  it('shows only the ASCA Scent Detection class list for an ASCA show', async () => {
    setOrganization('ASCA');

    render(<ClassSelectionStep />);

    expect(await screen.findByLabelText(/Select ASCA Container Open/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/AKC Container Novice A/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/UKC Vehicle Novice/i)).not.toBeInTheDocument();
  });
});

describe('ClassSelectionStep — a retained cloned class names itself on screen', () => {
  it('renders the custom class name as VISIBLE text, not only in the aria-label', async () => {
    mockUseWizardStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector(wizardStateWithRetainedCustomClass())
    );

    render(<ClassSelectionStep />);

    const cloned = await screen.findByLabelText('Deselect AKC Container Novice A Preliminary');
    // The accessible name was ALWAYS correct — read what a sighted secretary sees.
    expect((cloned.textContent ?? '').replace(/\s+/gu, ' ')).toContain(
      'AKC Container Novice A Preliminary'
    );
  });
});
