/**
 * MYK9-1580: step 3 offers only judges qualified for the show's registry, never rewrites an
 * existing class judge, and explains an empty list correctly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const h = vi.hoisted(() => ({
  wizard: vi.fn(),
  people: [] as unknown[],
  updateTrial: vi.fn(),
  assignJudgeToClass: vi.fn(),
}));

vi.mock('@/store/wizardStore', () => ({ useWizardStore: h.wizard }));
vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ people: h.people, loadPeople: vi.fn() }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [
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
    ],
    isLoading: false,
    isInitialized: true,
  }),
}));

import { ClassSelectionStep } from '../ClassSelectionStep';

const person = (id: string, org: string) => ({
  id,
  firstName: id,
  lastName: 'Judge',
  judgeInfo: { judgeNumber: '1', qualifications: [{ organization: org, status: 'Active' }] },
});

const cls = (className: string, judgeId?: string) => ({
  templateId: 'tmpl-ukc',
  ...(judgeId ? { judgeId } : {}),
  customizations: { className, element: 'Vehicle', level: 'Novice', section: '', displayOrder: 1 },
});

function setState(judgeIds: string[], classes: unknown[], judgeAssignments = {}) {
  const state = {
    trials: [
      {
        id: 'trial-1',
        nameOverride: 'Sat',
        trialDate: '',
        eventNumber: '',
        trialType: 'Nosework',
        classes,
      },
    ],
    updateTrial: h.updateTrial,
    show: {
      name: 'S',
      organization: 'UKC',
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds,
    },
    judgeDetails: {},
    judgeAssignments,
    assignJudgeToClass: h.assignJudgeToClass,
    setCurrentStep: vi.fn(),
  };
  h.wizard.mockImplementation((selector: (s: unknown) => unknown) => selector(state));
}

const view = () =>
  createWizardTrialView([{ id: 'trial-1', nameOverride: 'Sat', trialDate: '' }], []);

describe('ClassSelectionStep judges (MYK9-1580)', () => {
  beforeEach(() => {
    h.updateTrial.mockReset();
    h.assignJudgeToClass.mockReset();
    h.people = [person('A', 'UKC'), person('B', 'AKC')];
  });

  it('never changes a class that already has a judge, even an unqualified one', () => {
    setState(['A', 'B'], [cls('Existing', 'B'), cls('Fresh')], { Existing: 'B' });
    render(<ClassSelectionStep trialView={view()} />);

    expect(h.assignJudgeToClass).toHaveBeenCalledTimes(1);
    expect(h.assignJudgeToClass).toHaveBeenCalledWith('Fresh', 'A');
    const classes = h.updateTrial.mock.calls[0]![1].classes as Array<{ judgeId?: string }>;
    expect(classes.map(c => c.judgeId)).toEqual(['B', 'A']);
  });

  it('says the judges lack registry credentials when none is qualified', () => {
    setState(['B'], []);
    render(<ClassSelectionStep trialView={view()} />);

    expect(
      screen.getByText(/None of this show's judges have UKC credentials yet/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/has no judges yet/)).toBeNull();
  });

  it('shows no judges notice until people have loaded', () => {
    h.people = [];
    setState(['B'], []);
    render(<ClassSelectionStep trialView={view()} />);

    expect(screen.queryByText(/credentials yet/)).toBeNull();
    expect(screen.queryByText(/has no judges yet/)).toBeNull();
  });
});
